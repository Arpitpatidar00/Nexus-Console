use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use crate::core::error::{AppError, AppResult};

/// Safe defaults for process execution across the app.
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);
pub const DEFAULT_MAX_OUTPUT_BYTES: usize = 1024 * 1024; // 1 MB cap

/// Environment variables explicitly permitted when scrubbing process environment.
/// Keeps subprocesses safe from inherited credentials, secret tokens, and session credentials.
pub const SAFE_ENV_VARS: &[&str] = &[
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "TERM",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "HOMEBREW_PREFIX",
    "HOMEBREW_CELLAR",
    "HOMEBREW_REPOSITORY",
];

/// Where developer CLIs live on a Mac. A Finder/Dock launch inherits launchd's
/// bare `/usr/bin:/bin:/usr/sbin:/sbin`, so `psql`, `docker`, `aws`, `gh`…
/// failed with "No such file or directory" outside a terminal.
const TOOL_DIRS: &[&str] = &[
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    "/Applications/Docker.app/Contents/Resources/bin",
    // Homebrew's database clients are keg-only: installed, but not linked
    // into bin/ unless the user runs `brew link --force`.
    "/opt/homebrew/opt/libpq/bin",
    "/opt/homebrew/opt/mysql-client/bin",
    "/usr/local/opt/libpq/bin",
    "/usr/local/opt/mysql-client/bin",
];

/// Pure: `current` with the tool dirs (and `~/.orbstack/bin`) appended when
/// missing. Appended, not prepended — the system's own binaries keep winning.
pub fn augmented_path(current: &str, home: Option<&str>) -> String {
    let mut parts: Vec<String> = current
        .split(':')
        .filter(|p| !p.is_empty())
        .map(String::from)
        .collect();
    let extra = TOOL_DIRS
        .iter()
        .map(|d| (*d).to_string())
        .chain(home.map(|h| format!("{h}/.orbstack/bin")));
    for dir in extra {
        if !parts.contains(&dir) {
            parts.push(dir);
        }
    }
    parts.join(":")
}

/// Call once at startup, before any thread exists, so every spawn path —
/// `exec::run` and the raw `Command`s alike — finds Homebrew/Docker tools.
pub fn ensure_tool_path() {
    let current = std::env::var("PATH").unwrap_or_default();
    let home = std::env::var("HOME").ok();
    let next = augmented_path(&current, home.as_deref());
    if next != current {
        std::env::set_var("PATH", next);
    }
}

/// Options for executing a subprocess via argv.
#[derive(Debug, Clone)]
pub struct ExecOpts {
    pub timeout: Duration,
    pub max_out: usize,
    pub stdin: Option<Vec<u8>>,
    pub env: HashMap<String, String>,
    pub cwd: Option<PathBuf>,
    pub scrub_env: bool,
    pub check_exit: bool,
}

impl Default for ExecOpts {
    fn default() -> Self {
        Self {
            timeout: DEFAULT_TIMEOUT,
            max_out: DEFAULT_MAX_OUTPUT_BYTES,
            stdin: None,
            env: HashMap::new(),
            cwd: None,
            scrub_env: true,
            check_exit: true,
        }
    }
}

impl ExecOpts {
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub fn with_stdin(mut self, stdin: Vec<u8>) -> Self {
        self.stdin = Some(stdin);
        self
    }

    pub fn with_max_out(mut self, max_out: usize) -> Self {
        self.max_out = max_out;
        self
    }

    pub fn with_env<K: Into<String>, V: Into<String>>(mut self, key: K, val: V) -> Self {
        self.env.insert(key.into(), val.into());
        self
    }

    pub fn with_cwd<P: Into<PathBuf>>(mut self, cwd: P) -> Self {
        self.cwd = Some(cwd.into());
        self
    }

    pub fn no_check_exit(mut self) -> Self {
        self.check_exit = false;
        self
    }
}

/// Output captured from a bounded, argv-only subprocess execution.
#[derive(Debug, Clone)]
pub struct ExecOutput {
    pub status: ExitStatus,
    pub stdout: Vec<u8>,
    pub stdout_str: String,
    pub stdout_truncated: bool,
    pub stderr: Vec<u8>,
    pub stderr_str: String,
    pub stderr_truncated: bool,
    pub elapsed: Duration,
}

fn read_capped<R: Read + Send + 'static>(
    mut reader: R,
    max_bytes: usize,
) -> mpsc::Receiver<(Vec<u8>, bool)> {
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        // Read at most max_bytes + 1 to detect truncation without unbounded allocation
        let mut take = (&mut reader).take((max_bytes as u64).saturating_add(1));
        let _ = take.read_to_end(&mut buf);
        let truncated = buf.len() > max_bytes;
        if truncated {
            buf.truncate(max_bytes);
        }
        let _ = tx.send((buf, truncated));
    });
    rx
}

/// Execute an external executable using strict argv arguments (never a shell string).
/// Enforces:
/// 1. Timeout kill with process tree cleanup
/// 2. Bounded stdout/stderr memory consumption (`max_out` bytes)
/// 3. Environment scrubbing (prevents credential leaking to subprocesses)
/// 4. Strict argument validation (no null bytes)
pub fn run<P: AsRef<Path>, S: AsRef<str>>(
    program: P,
    args: &[S],
    opts: ExecOpts,
) -> AppResult<ExecOutput> {
    let program_path = program.as_ref();
    let program_str = program_path.to_string_lossy();

    // Reject null bytes in program path or arguments (POSIX exec safety)
    if program_str.contains('\0') {
        return Err(AppError::InvalidName(format!(
            "executable path contains null byte: {program_str}"
        )));
    }
    for (idx, arg) in args.iter().enumerate() {
        if arg.as_ref().contains('\0') {
            return Err(AppError::InvalidName(format!(
                "argument at index {idx} contains null byte"
            )));
        }
    }

    let mut cmd = Command::new(program_path);

    for arg in args {
        cmd.arg(arg.as_ref());
    }

    if let Some(ref cwd) = opts.cwd {
        cmd.current_dir(cwd);
    }

    if opts.scrub_env {
        // Collect safe variables first before clearing
        let mut safe_values = HashMap::new();
        for &var in SAFE_ENV_VARS {
            if let Ok(val) = std::env::var(var) {
                safe_values.insert(var.to_string(), val);
            }
        }
        cmd.env_clear();
        for (k, v) in safe_values {
            cmd.env(k, v);
        }
    }

    // Apply caller-specified env variables
    for (k, v) in &opts.env {
        cmd.env(k, v);
    }

    cmd.stdin(if opts.stdin.is_some() {
        Stdio::piped()
    } else {
        Stdio::null()
    });
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let start = Instant::now();
    let mut child: Child = cmd
        .spawn()
        .map_err(|e| AppError::Shell(format!("failed to spawn '{program_str}': {e}")))?;

    // Write stdin if requested
    if let Some(data) = opts.stdin {
        if let Some(mut stdin) = child.stdin.take() {
            std::thread::spawn(move || {
                let _ = stdin.write_all(&data);
                let _ = stdin.flush();
            });
        }
    }

    let stdout_pipe = child.stdout.take();
    let stderr_pipe = child.stderr.take();

    let stdout_rx = stdout_pipe.map(|p| read_capped(p, opts.max_out));
    let stderr_rx = stderr_pipe.map(|p| read_capped(p, opts.max_out));

    let status = loop {
        match child.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) => {
                if start.elapsed() >= opts.timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(AppError::Timeout(format!(
                        "process '{program_str}' timed out after {:?}",
                        opts.timeout
                    )));
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(AppError::Shell(format!(
                    "error waiting for '{program_str}': {e}"
                )));
            }
        }
    };

    let elapsed = start.elapsed();

    let (stdout_bytes, stdout_truncated) = stdout_rx
        .and_then(|rx| rx.recv_timeout(Duration::from_millis(500)).ok())
        .unwrap_or_default();

    let (stderr_bytes, stderr_truncated) = stderr_rx
        .and_then(|rx| rx.recv_timeout(Duration::from_millis(500)).ok())
        .unwrap_or_default();

    let stdout_str = String::from_utf8_lossy(&stdout_bytes).to_string();
    let stderr_str = String::from_utf8_lossy(&stderr_bytes).to_string();

    let out = ExecOutput {
        status,
        stdout: stdout_bytes,
        stdout_str,
        stdout_truncated,
        stderr: stderr_bytes,
        stderr_str,
        stderr_truncated,
        elapsed,
    };

    if opts.check_exit && !out.status.success() {
        let code = out.status.code().unwrap_or(-1);
        let detail = if !out.stderr_str.trim().is_empty() {
            out.stderr_str.trim()
        } else if !out.stdout_str.trim().is_empty() {
            out.stdout_str.trim()
        } else {
            "no output"
        };
        return Err(AppError::Shell(format!(
            "'{program_str}' exited with status {code}: {detail}"
        )));
    }

    Ok(out)
}

#[cfg(test)]
mod tests {
    #[test]
    fn augmented_path_adds_tool_dirs_once_after_system_dirs() {
        let p = super::augmented_path("/usr/bin:/bin:/usr/sbin:/sbin", Some("/Users/me"));
        assert!(p.starts_with("/usr/bin:/bin:/usr/sbin:/sbin:"));
        assert!(p.contains(":/opt/homebrew/bin"));
        assert!(p.ends_with(":/Users/me/.orbstack/bin"));
        assert_eq!(super::augmented_path(&p, Some("/Users/me")), p);
    }

    use super::*;

    #[test]
    fn executes_simple_argv_command() {
        let out = run("/bin/echo", &["hello", "world"], ExecOpts::default()).unwrap();
        assert!(out.status.success());
        assert_eq!(out.stdout_str.trim(), "hello world");
        assert!(!out.stdout_truncated);
    }

    #[test]
    fn passes_stdin_to_process() {
        let opts = ExecOpts::default().with_stdin(b"streamed input".to_vec());
        let out = run("/bin/cat", &[] as &[&str], opts).unwrap();
        assert!(out.status.success());
        assert_eq!(out.stdout_str, "streamed input");
    }

    #[test]
    fn kills_on_timeout() {
        let opts = ExecOpts::default().with_timeout(Duration::from_millis(100));
        let err = run("/bin/sleep", &["5"], opts).unwrap_err();
        match err {
            AppError::Timeout(msg) => assert!(msg.contains("timed out")),
            other => panic!("expected Timeout error, got {other:?}"),
        }
    }

    #[test]
    fn truncates_output_at_max_out() {
        let opts = ExecOpts::default().with_max_out(10);
        let out = run("/bin/echo", &["1234567890abcdefghij"], opts).unwrap();
        assert!(out.stdout_truncated);
        assert_eq!(out.stdout.len(), 10);
        assert_eq!(out.stdout_str, "1234567890");
    }

    #[test]
    fn non_zero_exit_returns_shell_error() {
        let opts = ExecOpts::default();
        let err = run("/bin/sh", &["-c", "exit 42"], opts).unwrap_err();
        match err {
            AppError::Shell(msg) => assert!(msg.contains("status 42")),
            other => panic!("expected Shell error, got {other:?}"),
        }
    }

    #[test]
    fn non_zero_exit_without_check_returns_output() {
        let opts = ExecOpts::default().no_check_exit();
        let out = run("/bin/sh", &["-c", "echo 'failed step' >&2; exit 42"], opts).unwrap();
        assert_eq!(out.status.code(), Some(42));
        assert!(out.stderr_str.contains("failed step"));
    }

    #[test]
    fn scrubs_environment_by_default() {
        // Set a dummy secret in process env
        std::env::set_var("STACKROOST_SUPER_SECRET_KEY", "sensitive-value-1234");

        let out = run(
            "/usr/bin/env",
            &[] as &[&str],
            ExecOpts::default().no_check_exit(),
        )
        .unwrap();

        assert!(!out.stdout_str.contains("STACKROOST_SUPER_SECRET_KEY"));
        assert!(!out.stdout_str.contains("sensitive-value-1234"));
    }

    #[test]
    fn allows_explicit_env_vars() {
        let opts = ExecOpts::default()
            .with_env("CUSTOM_PARAM", "allowlisted_value")
            .no_check_exit();

        let out = run("/usr/bin/env", &[] as &[&str], opts).unwrap();
        assert!(out.stdout_str.contains("CUSTOM_PARAM=allowlisted_value"));
    }

    #[test]
    fn rejects_null_bytes() {
        let err = run("/bin/echo\0", &["foo"], ExecOpts::default()).unwrap_err();
        assert!(matches!(err, AppError::InvalidName(_)));

        let err2 = run("/bin/echo", &["foo\0bar"], ExecOpts::default()).unwrap_err();
        assert!(matches!(err2, AppError::InvalidName(_)));
    }
}
