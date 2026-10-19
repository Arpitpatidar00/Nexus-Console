// The system OpenSSH client, shelled out with an argv array (docs/remote/PLAN.md
// §2, §4.2). It honours the user's real config, keys, agent and known_hosts, so
// this file holds no crypto and never relaxes host-key checking.

use super::store::Host;
use crate::error::{AppError, AppResult};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Command, ExitStatus, Stdio};
use std::sync::{Condvar, Mutex};
use std::time::{Duration, Instant};

pub const SSH_BIN: &str = "/usr/bin/ssh";
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(20);
const STDOUT_CAP: usize = 4 * 1024 * 1024;
const STDERR_CAP: usize = 64 * 1024;
const MAX_CONCURRENT: usize = 4;

/// Where ssh lands once its argv is assembled: the alias for ssh_config hosts
/// (ssh resolves everything else itself), or explicit flags for manual hosts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SshTarget(Vec<String>);

impl SshTarget {
    pub fn from_host(host: &Host) -> AppResult<SshTarget> {
        if let Some(m) = &host.manual {
            let mut v = vec!["-p".to_string(), m.port.to_string()];
            if let Some(key) = &m.identity_file {
                v.extend([
                    "-i".into(),
                    key.clone(),
                    "-o".into(),
                    "IdentitiesOnly=yes".into(),
                ]);
            }
            v.push(format!("{}@{}", m.user, m.hostname));
            return Ok(SshTarget(v));
        }
        host.alias
            .clone()
            .map(|a| SshTarget(vec![a]))
            .ok_or_else(|| AppError::Parse(format!("host {} has no alias", host.id)))
    }

    #[cfg(test)]
    pub fn alias(a: &str) -> SshTarget {
        SshTarget(vec![a.into()])
    }
}

/// `-F <path>` for the local testbed (§8.3). Compiled out of release builds so
/// a stray env var can never point a shipped app at another config.
fn config_override() -> Vec<String> {
    if cfg!(debug_assertions) {
        if let Some(p) = std::env::var_os("NEXUS_SSH_CONFIG") {
            return vec!["-F".into(), p.to_string_lossy().into_owned()];
        }
    }
    vec![]
}

/// Prefix for every ssh call that reads the user's config (`-G` too).
pub fn base_args() -> Vec<String> {
    config_override()
}

/// `~/Library/Caches/com.vss.nexusconsole/cm`, created `0700`. `%C` (a 40-char
/// hash) keeps socket paths under macOS's 104-byte limit.
pub fn control_dir() -> AppResult<PathBuf> {
    use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
    let home = std::env::var_os("HOME").ok_or_else(|| AppError::NotFound("HOME not set".into()))?;
    let dir = PathBuf::from(home).join("Library/Caches/com.vss.nexusconsole/cm");
    let io = |e: std::io::Error| AppError::Io(format!("ssh control dir: {e}"));
    std::fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(&dir)
        .map_err(io)?;
    // `recursive` leaves an existing dir's mode alone; force it.
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).map_err(io)?;
    Ok(dir)
}

fn opt(kv: String) -> [String; 2] {
    ["-o".into(), kv]
}

/// Multiplexing options shared by background execs and `-O` control ops.
fn control_opts(control_dir: &std::path::Path) -> Vec<String> {
    let path = control_dir.join("%C").to_string_lossy().into_owned();
    // ssh tokenizes `-o` values on whitespace; quote a path with spaces.
    let path = if path.contains(char::is_whitespace) {
        format!("\"{path}\"")
    } else {
        path
    };
    [
        opt("ControlMaster=auto".into()),
        opt("ControlPersist=300".into()),
        opt(format!("ControlPath={path}")),
    ]
    .concat()
}

/// Full argv (after the binary) for a background exec: never prompts, fails
/// fast, multiplexed. Host keys keep the user's own checking policy: there is
/// deliberately no StrictHostKeyChecking override here.
pub fn build_args(
    target: &SshTarget,
    control_dir: &std::path::Path,
    remote_cmd: &[&str],
) -> Vec<String> {
    let mut v = base_args();
    for kv in [
        "BatchMode=yes",
        "ConnectTimeout=8",
        "ServerAliveInterval=15",
        "ServerAliveCountMax=2",
    ] {
        v.extend(opt(kv.into()));
    }
    v.extend(control_opts(control_dir));
    v.extend(target.0.iter().cloned());
    v.push("--".into());
    v.extend(remote_cmd.iter().map(|s| s.to_string()));
    v
}

/// argv for `ssh -O <op>` against the host's master socket.
pub fn control_args(target: &SshTarget, control_dir: &std::path::Path, op: &str) -> Vec<String> {
    let mut v = base_args();
    v.extend(["-O".into(), op.into()]);
    v.extend(control_opts(control_dir));
    v.extend(target.0.iter().cloned());
    v
}

#[derive(Debug)]
pub struct ExecOutput {
    pub status: ExitStatus,
    // ponytail: first read by the P2 probe.
    #[allow(dead_code)]
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub elapsed: Duration,
}

/// A counting semaphore: at most `MAX_CONCURRENT` ssh processes at once.
static SLOTS: Mutex<usize> = Mutex::new(0);
static FREED: Condvar = Condvar::new();

struct Slot;

impl Slot {
    fn acquire() -> Slot {
        let mut used = SLOTS.lock().unwrap_or_else(|e| e.into_inner());
        while *used >= MAX_CONCURRENT {
            used = FREED.wait(used).unwrap_or_else(|e| e.into_inner());
        }
        *used += 1;
        Slot
    }
}

impl Drop for Slot {
    fn drop(&mut self) {
        *SLOTS.lock().unwrap_or_else(|e| e.into_inner()) -= 1;
        FREED.notify_one();
    }
}

fn read_capped(mut r: impl Read + Send + 'static, cap: usize) -> std::thread::JoinHandle<Vec<u8>> {
    std::thread::spawn(move || {
        let mut out = Vec::new();
        let mut buf = [0u8; 8192];
        while let Ok(n) = r.read(&mut buf) {
            if n == 0 {
                break;
            }
            let room = cap.saturating_sub(out.len());
            out.extend_from_slice(&buf[..n.min(room)]);
            // Keep draining past the cap so the child never blocks on a full pipe.
        }
        out
    })
}

/// After the child exits, a pipe can stay open if something it forked kept
/// the fd (a ControlPersist master, in theory). Wait briefly, never forever.
fn join_within(h: std::thread::JoinHandle<Vec<u8>>, grace: Duration) -> Vec<u8> {
    let until = Instant::now() + grace;
    while !h.is_finished() && Instant::now() < until {
        std::thread::sleep(Duration::from_millis(5));
    }
    if h.is_finished() {
        h.join().unwrap_or_default()
    } else {
        Vec::new()
    }
}

/// Run one background ssh exec. Blocking: call from `commands::blocking`.
/// Exit status 255 (ssh's own failure) is classified into a typed error; any
/// other status is the remote command's and is returned for the caller to read.
pub fn exec(
    target: &SshTarget,
    remote_cmd: &[&str],
    stdin: Option<&[u8]>,
    timeout: Duration,
) -> AppResult<ExecOutput> {
    let args = build_args(target, &control_dir()?, remote_cmd);
    let _slot = Slot::acquire();
    let start = Instant::now();
    let mut child = Command::new(SSH_BIN)
        .args(&args)
        .stdin(if stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Shell(format!("couldn't start ssh: {e}")))?;

    let out_h = read_capped(child.stdout.take().expect("piped"), STDOUT_CAP);
    let err_h = read_capped(child.stderr.take().expect("piped"), STDERR_CAP);
    if let (Some(data), Some(mut pipe)) = (stdin, child.stdin.take()) {
        let data = data.to_vec();
        // A writer thread so a remote that never reads can't block us past the deadline.
        std::thread::spawn(move || {
            let _ = pipe.write_all(&data);
        });
    }

    let status = loop {
        if let Some(s) = child
            .try_wait()
            .map_err(|e| AppError::Shell(format!("ssh wait failed: {e}")))?
        {
            break s;
        }
        if start.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err(AppError::Timeout(format!(
                "no answer after {}s",
                timeout.as_secs()
            )));
        }
        std::thread::sleep(Duration::from_millis(10));
    };

    let grace = Duration::from_millis(500);
    let out = ExecOutput {
        status,
        stdout: join_within(out_h, grace),
        stderr: join_within(err_h, grace),
        elapsed: start.elapsed(),
    };
    if out.status.code() == Some(255) {
        return Err(classify(&String::from_utf8_lossy(&out.stderr)));
    }
    Ok(out)
}

/// Run a `-O` control op (local socket only, so no slot and a short deadline).
fn control(target: &SshTarget, op: &str) -> bool {
    let Ok(dir) = control_dir() else {
        return false;
    };
    let Ok(mut child) = Command::new(SSH_BIN)
        .args(control_args(target, &dir, op))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    else {
        return false;
    };
    let until = Instant::now() + Duration::from_secs(3);
    loop {
        match child.try_wait() {
            Ok(Some(s)) => return s.success(),
            Ok(None) if Instant::now() < until => std::thread::sleep(Duration::from_millis(5)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return false;
            }
        }
    }
}

/// Is a master connection alive for this host?
pub fn control_check(target: &SshTarget) -> bool {
    control(target, "check")
}

/// Close the host's master, if any. Best-effort; returns whether one was closed.
pub fn control_exit(target: &SshTarget) -> bool {
    control(target, "exit")
}

/// Classify ssh's own failure (exit 255) by its stderr. The first meaningful
/// line rides along as `detail`.
pub fn classify(stderr: &str) -> AppError {
    let line = stderr
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.starts_with("@@@") && !l.starts_with("Warning: Permanently"))
        .unwrap_or("ssh failed")
        .to_string();
    let has = |needles: &[&str]| needles.iter().any(|n| stderr.contains(n));
    if has(&[
        "Host key verification failed",
        "REMOTE HOST IDENTIFICATION HAS CHANGED",
        "host key is known for",
    ]) {
        AppError::HostKey(line)
    } else if has(&["Permission denied ("]) {
        AppError::Auth(line)
    } else if has(&[
        "Could not resolve hostname",
        "Connection refused",
        "Connection timed out",
        "Operation timed out",
        "No route to host",
        "Network is unreachable",
        "Connection closed by",
        "Connection reset by",
    ]) {
        AppError::Unreachable(line)
    } else {
        AppError::Shell(line)
    }
}

#[cfg(test)]
mod tests {
    use super::super::store::{Env, HostSource, ManualTarget};
    use super::*;
    use std::path::Path;

    const CM: &str = "/Users/me/Library/Caches/com.vss.nexusconsole/cm";

    fn args_for(target: &SshTarget, cmd: &[&str]) -> Vec<String> {
        build_args(target, Path::new(CM), cmd)
    }

    fn has_pair(v: &[String], a: &str, b: &str) -> bool {
        v.windows(2).any(|w| w[0] == a && w[1] == b)
    }

    #[test]
    fn background_exec_never_prompts_and_is_multiplexed() {
        let v = args_for(&SshTarget::alias("fameo-prod"), &["true"]);
        assert!(has_pair(&v, "-o", "BatchMode=yes"));
        assert!(has_pair(&v, "-o", "ConnectTimeout=8"));
        assert!(has_pair(&v, "-o", "ServerAliveInterval=15"));
        assert!(has_pair(&v, "-o", "ServerAliveCountMax=2"));
        assert!(has_pair(&v, "-o", "ControlMaster=auto"));
        assert!(has_pair(&v, "-o", "ControlPersist=300"));
        assert!(has_pair(&v, "-o", &format!("ControlPath={CM}/%C")));
        assert_eq!(&v[v.len() - 3..], ["fameo-prod", "--", "true"]);
    }

    #[test]
    fn never_relaxes_host_key_checking() {
        let v = args_for(&SshTarget::alias("x"), &["true"]).join(" ");
        assert!(!v.contains("StrictHostKeyChecking"));
        assert!(!v.contains("accept-new"));
        assert!(!v.contains("UserKnownHostsFile"));
    }

    #[test]
    fn manual_target_is_explicit_flags() {
        let mut h = Host {
            id: "h_1".into(),
            source: HostSource::Manual,
            alias: None,
            manual: Some(ManualTarget {
                hostname: "10.0.0.5".into(),
                user: "ubuntu".into(),
                port: 2202,
                identity_file: Some("~/.ssh/prod.pem".into()),
            }),
            label: "box".into(),
            project: "P".into(),
            env: Env::Dev,
            order: 0,
        };
        let v = args_for(&SshTarget::from_host(&h).unwrap(), &["true"]);
        assert!(has_pair(&v, "-p", "2202"));
        assert!(has_pair(&v, "-i", "~/.ssh/prod.pem"));
        assert!(has_pair(&v, "-o", "IdentitiesOnly=yes"));
        assert_eq!(&v[v.len() - 3..], ["ubuntu@10.0.0.5", "--", "true"]);

        h.manual.as_mut().unwrap().identity_file = None;
        let v = args_for(&SshTarget::from_host(&h).unwrap(), &["true"]);
        assert!(!v.contains(&"-i".to_string()));
    }

    #[test]
    fn remote_command_always_follows_the_separator() {
        let v = args_for(&SshTarget::alias("h"), &["LC_ALL=C", "sh", "-s"]);
        let sep = v.iter().position(|a| a == "--").unwrap();
        assert_eq!(&v[sep + 1..], ["LC_ALL=C", "sh", "-s"]);
    }

    #[test]
    fn control_ops_use_the_same_socket() {
        let v = control_args(&SshTarget::alias("h"), Path::new(CM), "check");
        assert!(has_pair(&v, "-O", "check"));
        assert!(has_pair(&v, "-o", &format!("ControlPath={CM}/%C")));
        assert_eq!(v.last().unwrap(), "h");
    }

    #[test]
    fn control_path_with_spaces_is_quoted() {
        let v = control_args(&SshTarget::alias("h"), Path::new("/Users/a b/cm"), "check");
        assert!(has_pair(&v, "-o", "ControlPath=\"/Users/a b/cm/%C\""));
    }

    // Captured from /usr/bin/ssh (OpenSSH_10.3p1, macOS) on 2026-10-20, except
    // the host-key/auth lines, which are OpenSSH's fixed messages verbatim.
    #[test]
    fn classifies_real_ssh_failures() {
        let cases: &[(&str, &str)] = &[
            ("ssh: connect to host 127.0.0.1 port 1: Connection refused", "unreachable"),
            ("ssh: Could not resolve hostname nope.invalid: nodename nor servname provided, or not known", "unreachable"),
            ("ssh: connect to host 10.255.255.1 port 22: Operation timed out", "unreachable"),
            ("ssh: connect to host 10.0.0.9 port 22: No route to host", "unreachable"),
            ("nexus@127.0.0.1: Permission denied (publickey).", "auth"),
            ("nexus@127.0.0.1: Permission denied (publickey,password).", "auth"),
            ("Host key verification failed.", "hostKey"),
            ("No ED25519 host key is known for [127.0.0.1]:2223 and you have requested strict checking.\r\nHost key verification failed.", "hostKey"),
            ("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\n@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @\n@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\nIT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!", "hostKey"),
            ("kex_exchange_identification: read: Connection reset by peer", "unreachable"),
            ("something unexpected", "shell"),
        ];
        for (stderr, kind) in cases {
            let got = serde_json::to_value(classify(stderr)).unwrap();
            assert_eq!(got["kind"], *kind, "for: {stderr}");
        }
    }

    #[test]
    fn classified_detail_is_the_meaningful_line() {
        let e = classify("@@@@@@@@@@@@\n@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @\n@@@@@@@@@@@@");
        let v = serde_json::to_value(e).unwrap();
        assert!(v["detail"]
            .as_str()
            .unwrap()
            .contains("REMOTE HOST IDENTIFICATION"));
        let e = classify("ssh: connect to host 127.0.0.1 port 1: Connection refused\n");
        let v = serde_json::to_value(e).unwrap();
        assert_eq!(v["message"], "Can't reach the server.");
        assert_eq!(
            v["detail"],
            "ssh: connect to host 127.0.0.1 port 1: Connection refused"
        );
    }

    // Real /usr/bin/ssh, nothing listening on port 1: the full exec path
    // returns a typed error, not a hang. Local-only, so not ignored.
    #[test]
    fn exec_against_a_closed_port_is_unreachable() {
        let t = SshTarget(vec![
            "-F".into(),
            "/dev/null".into(),
            "-p".into(),
            "1".into(),
            "127.0.0.1".into(),
        ]);
        let err = exec(&t, &["true"], None, Duration::from_secs(10)).unwrap_err();
        assert!(matches!(err, AppError::Unreachable(_)), "{err:?}");
    }
}
