use crate::context::AppContext;
use crate::error::{AppError, AppResult};
use crate::remote::{ssh, RemoteState};
use crate::util::{plist, validate};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::os::unix::io::RawFd;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;
use tauri::State;

pub const MAX_PTYS: usize = 8;
/// Cap per flushed Output event — bounds both IPC payloads and xterm write calls.
const MAX_BATCH: usize = 32 * 1024;

/// Zero-timeout poll: is more PTY output already buffered? Zero timeout means
/// coalescing never ADDS latency — a lone keystroke echo flushes immediately.
fn readable_now(fd: RawFd) -> bool {
    let mut p = libc::pollfd {
        fd,
        events: libc::POLLIN,
        revents: 0,
    };
    // SAFETY: poll(2) on one fd with zero timeout; no memory handed to the kernel
    // beyond the pollfd on our stack.
    unsafe { libc::poll(&mut p, 1, 0) > 0 && (p.revents & libc::POLLIN) != 0 }
}

/// Take the largest valid-UTF-8 prefix out of `acc`, holding back an incomplete
/// trailing codepoint for the next batch (a read can split a multi-byte char —
/// flushing the halves separately renders mojibake). Genuinely invalid bytes
/// (binary output) degrade lossily, same as before.
fn take_utf8(acc: &mut Vec<u8>) -> String {
    match std::str::from_utf8(acc.as_slice()) {
        Ok(s) => {
            let out = s.to_owned();
            acc.clear();
            out
        }
        Err(e) if e.error_len().is_none() => {
            let tail = acc.split_off(e.valid_up_to());
            let out = String::from_utf8_lossy(acc).into_owned();
            *acc = tail;
            out
        }
        Err(_) => {
            let out = String::from_utf8_lossy(acc).into_owned();
            acc.clear();
            out
        }
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PtyEvent {
    Output { data: String },
    Exit,
}

struct Session {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
    target: PtyTarget,
    last_activity: Arc<AtomicU64>,
}

impl Session {
    pub fn is_foreground_job_running(&self) -> bool {
        if let Some(fd) = self.master.as_raw_fd() {
            let child_pid = self.child.process_id().unwrap_or(0);
            unsafe {
                let pgrp = libc::tcgetpgrp(fd);
                if pgrp > 0 && child_pid > 0 {
                    return pgrp as u32 != child_pid;
                }
            }
        }
        false
    }
}

#[derive(Default)]
pub struct PtyManager {
    sessions: Mutex<HashMap<String, Session>>,
}

impl PtyManager {
    #[allow(clippy::too_many_arguments)]
    fn open(
        &self,
        id: String,
        target: PtyTarget,
        program: String,
        args: Vec<String>,
        cols: u16,
        rows: u16,
        on_event: Channel<PtyEvent>,
    ) -> AppResult<()> {
        let mut map = lock(&self.sessions)?;
        if map.contains_key(&id) {
            return Ok(()); // already open — focus handled client-side
        }
        if map.len() >= MAX_PTYS {
            return Err(AppError::Forbidden(format!(
                "terminal limit ({MAX_PTYS}) reached"
            )));
        }

        let pair = native_pty_system()
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::Io(format!("openpty: {e}")))?;

        let mut cmd = CommandBuilder::new(&program);
        cmd.args(&args);
        cmd.env("TERM", "xterm-256color");

        if target.inject_keychain() {
            // Optional Keychain injection into Nexus terminals (T-18)
            for key in ["DATABASE_URL", "DB_PASSWORD", "API_KEY", "SECRET_KEY"] {
                if let Ok(Some(secret)) =
                    crate::core::keychain::get_password(&format!("nexus.terminal:{key}"))
                {
                    cmd.env(key, secret);
                }
            }
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::Shell(format!("spawn {program}: {e}")))?;
        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::Io(format!("pty reader: {e}")))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| AppError::Io(format!("pty writer: {e}")))?;

        // Blocking reader thread streams output to the JS Channel until EOF.
        // Coalesced: after each blocking read, whatever is ALREADY buffered is
        // drained (zero-timeout poll) up to MAX_BATCH and flushed as one event —
        // a fast producer (`yes`, big logs) floods neither IPC nor xterm, while
        // interactive echo still flushes per read with no added latency.
        let master_fd = pair.master.as_raw_fd();
        let last_activity = Arc::new(AtomicU64::new(crate::doctor::claude::now_epoch()));
        let act_reader = last_activity.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            let mut acc: Vec<u8> = Vec::with_capacity(8192);
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        act_reader.store(crate::doctor::claude::now_epoch(), Ordering::Relaxed);
                        acc.extend_from_slice(&buf[..n]);
                        while acc.len() < MAX_BATCH && master_fd.is_some_and(readable_now) {
                            match reader.read(&mut buf) {
                                Ok(n2) if n2 > 0 => acc.extend_from_slice(&buf[..n2]),
                                _ => break,
                            }
                        }
                        let text = take_utf8(&mut acc);
                        if !text.is_empty()
                            && on_event.send(PtyEvent::Output { data: text }).is_err()
                        {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            // EOF: flush any held-back tail bytes (lossily — nothing follows them).
            if !acc.is_empty() {
                let _ = on_event.send(PtyEvent::Output {
                    data: String::from_utf8_lossy(&acc).into_owned(),
                });
            }
            let _ = on_event.send(PtyEvent::Exit);
        });

        map.insert(
            id,
            Session {
                writer,
                master: pair.master,
                child,
                target,
                last_activity,
            },
        );
        Ok(())
    }

    fn write(&self, id: &str, data: &[u8]) -> AppResult<()> {
        let mut map = lock(&self.sessions)?;
        if let Some(s) = map.get_mut(id) {
            s.last_activity
                .store(crate::doctor::claude::now_epoch(), Ordering::Relaxed);
            s.writer
                .write_all(data)
                .map_err(|e| AppError::Io(format!("pty write: {e}")))?;
            let _ = s.writer.flush();
        }
        Ok(())
    }

    pub fn is_foreground_job_running(&self, id: &str) -> bool {
        let Ok(map) = lock(&self.sessions) else {
            return false;
        };
        map.get(id).is_some_and(|s| s.is_foreground_job_running())
    }

    pub fn host_has_foreground_job(&self, host_id: &str) -> bool {
        let Ok(map) = lock(&self.sessions) else {
            return false;
        };
        for s in map.values() {
            if s.target.host_id() == Some(host_id) && s.is_foreground_job_running() {
                return true;
            }
        }
        false
    }

    pub fn host_last_activity(&self, host_id: &str) -> Option<u64> {
        let Ok(map) = lock(&self.sessions) else {
            return None;
        };
        let mut max_act = None;
        for s in map.values() {
            if s.target.host_id() == Some(host_id) {
                let act = s.last_activity.load(Ordering::Relaxed);
                max_act = Some(max_act.map_or(act, |m: u64| m.max(act)));
            }
        }
        max_act
    }

    pub fn kill_by_host(&self, host_id: &str) -> Vec<String> {
        let mut killed = Vec::new();
        if let Ok(mut map) = self.sessions.lock() {
            let ids: Vec<String> = map
                .iter()
                .filter(|(_, s)| {
                    s.target.host_id() == Some(host_id) && !s.is_foreground_job_running()
                })
                .map(|(id, _)| id.clone())
                .collect();
            for id in ids {
                if let Some(mut s) = map.remove(&id) {
                    kill_group(&mut s.child);
                    killed.push(id);
                }
            }
        }
        killed
    }

    fn resize(&self, id: &str, cols: u16, rows: u16) -> AppResult<()> {
        let map = lock(&self.sessions)?;
        if let Some(s) = map.get(id) {
            let _ = s.master.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            });
        }
        Ok(())
    }

    fn kill(&self, id: &str) -> AppResult<()> {
        let mut map = lock(&self.sessions)?;
        if let Some(mut s) = map.remove(id) {
            kill_group(&mut s.child);
        }
        Ok(())
    }

    /// Kill every live PTY (called on app quit so no children are orphaned).
    pub fn kill_all(&self) {
        if let Ok(mut map) = self.sessions.lock() {
            for (_, mut s) in map.drain() {
                kill_group(&mut s.child);
            }
        }
    }
}

/// PTY children are session/group leaders, so signal the whole process group —
/// this also kills anything launched inside the shell (node, docker, …).
fn kill_group(child: &mut Box<dyn Child + Send + Sync>) {
    if let Some(pid) = child.process_id() {
        // Negative pid = process group. SAFETY: kill(2) with a constant signal.
        unsafe {
            libc::kill(-(pid as i32), libc::SIGHUP);
        }
    }
    let _ = child.kill();
}

fn lock(
    m: &Mutex<HashMap<String, Session>>,
) -> AppResult<std::sync::MutexGuard<'_, HashMap<String, Session>>> {
    m.lock()
        .map_err(|_| AppError::Io("pty lock poisoned".into()))
}

/// What a terminal runs. JS names a target; Rust picks the program and argv —
/// the frontend never sends a program, path or host.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PtyTarget {
    Brew {
        formula: String,
        kind: String,
    },
    #[serde(rename_all = "camelCase")]
    RemoteShell {
        host_id: String,
    },
    #[serde(rename_all = "camelCase")]
    RemoteLogs {
        host_id: String,
        container: String,
    },
    #[serde(rename_all = "camelCase")]
    RemoteExec {
        host_id: String,
        container: String,
    },
    #[serde(rename_all = "camelCase")]
    Workspace {
        command: String,
        project_path: String,
        inject_keychain: Option<bool>,
    },
    /// A task the project's own config defines, by id. Rust re-detects the
    /// project and resolves the steps; JS never sends a command.
    #[serde(rename_all = "camelCase")]
    ProjectTask {
        project_path: String,
        task_id: String,
        install_first: Option<bool>,
    },
}

impl PtyTarget {
    pub fn host_id(&self) -> Option<&str> {
        match self {
            PtyTarget::RemoteShell { host_id } => Some(host_id),
            PtyTarget::RemoteLogs { host_id, .. } => Some(host_id),
            PtyTarget::RemoteExec { host_id, .. } => Some(host_id),
            PtyTarget::Brew { .. }
            | PtyTarget::Workspace { .. }
            | PtyTarget::ProjectTask { .. } => None,
        }
    }

    pub fn inject_keychain(&self) -> bool {
        match self {
            PtyTarget::Workspace {
                inject_keychain, ..
            } => inject_keychain.unwrap_or(false),
            _ => false,
        }
    }
}

/// Inside the container: bash if it has one, else sh. One argv entry, quoted,
/// because ssh joins the remote command into a single string for the remote
/// shell. Constant: no user input is ever spliced into it.
const EXEC_SHELL: &str = "'command -v bash >/dev/null && exec bash || exec sh'";

/// Remote targets → `ssh -t …`. Containers must be in the host's latest
/// snapshot, the same check as container actions.
fn resolve_remote(target: &PtyTarget, remote: &RemoteState) -> AppResult<(String, Vec<String>)> {
    let (host_id, cmd): (&str, Vec<String>) = match target {
        PtyTarget::RemoteShell { host_id } => (host_id, vec![]),
        PtyTarget::RemoteLogs { host_id, container } => {
            let c = remote.known_container(host_id, container)?;
            (
                host_id,
                ["docker", "logs", "-f", "--tail", "300"]
                    .map(String::from)
                    .into_iter()
                    .chain([c.name])
                    .collect(),
            )
        }
        PtyTarget::RemoteExec { host_id, container } => {
            let c = remote.known_container(host_id, container)?;
            (
                host_id,
                vec![
                    "docker".into(),
                    "exec".into(),
                    "-it".into(),
                    c.name,
                    "sh".into(),
                    "-c".into(),
                    EXEC_SHELL.into(),
                ],
            )
        }
        PtyTarget::Brew { .. } | PtyTarget::Workspace { .. } | PtyTarget::ProjectTask { .. } => {
            unreachable!("brew, workspace and project targets resolve locally")
        }
    };
    let t = remote.target(host_id)?;
    let cmd: Vec<&str> = cmd.iter().map(String::as_str).collect();
    Ok((
        ssh::SSH_BIN.into(),
        ssh::interactive_args(&t, &ssh::control_dir()?, &cmd),
    ))
}

fn resolve_target(
    target: &PtyTarget,
    ctx: &AppContext,
    remote: &RemoteState,
) -> AppResult<(String, Vec<String>)> {
    match target {
        PtyTarget::Brew { formula, kind } => resolve_command(formula, kind, ctx),
        PtyTarget::Workspace {
            command,
            project_path,
            ..
        } => {
            // A saved command is shell the user wrote (pipes, &&), so it runs as
            // shell — but the folder is an argument, never pasted into it: a
            // quote in a folder name used to break (or extend) the command.
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
            let mut args = vec!["-l".to_string(), "-c".to_string()];
            if project_path.is_empty() {
                args.extend([
                    r#"eval "$1""#.to_string(),
                    "stackroost".into(),
                    command.clone(),
                ]);
            } else {
                args.extend([
                    r#"cd -- "$1" && eval "$2""#.to_string(),
                    "stackroost".into(),
                    project_path.clone(),
                    command.clone(),
                ]);
            }
            Ok((shell, args))
        }
        PtyTarget::ProjectTask {
            project_path,
            task_id,
            install_first,
        } => resolve_project_task(project_path, task_id, install_first.unwrap_or(true)),
        _ => resolve_remote(target, remote),
    }
}

/// Runs the steps it's given as arguments — the folder, then each argv,
/// separated by `::then::` — echoing each one and stopping at the first
/// failure; the last step is exec'd so Ctrl-C and closing the tab reach it.
/// Every value is a positional parameter: nothing is spliced into the script.
const STEPS_SCRIPT: &str = r#"cd -- "$1" || exit 1
shift
step=()
while [ $# -gt 0 ]; do
  if [ "$1" = "::then::" ]; then
    printf '\n\033[1m$ %s\033[0m\n' "${step[*]}"
    "${step[@]}" || { s=$?; printf '\n\033[31m%s exited with %s. Stopped.\033[0m\n' "${step[*]}" "$s"; exit $s; }
    step=()
  else
    step+=("$1")
  fi
  shift
done
printf '\n\033[1m$ %s\033[0m\n' "${step[*]}"
exec "${step[@]}""#;

/// The user's login shell (zsh or bash, both run the script; anything else
/// falls back to zsh), interactive so nvm/fnm/pyenv set up in rc files apply.
fn project_task_argv(dir: &str, steps: &[Vec<String>]) -> (String, Vec<String>) {
    let shell = std::env::var("SHELL")
        .ok()
        .filter(|s| s.ends_with("/zsh") || s.ends_with("/bash"))
        .unwrap_or_else(|| "/bin/zsh".into());
    let mut args: Vec<String> = vec![
        "-l".into(),
        "-i".into(),
        "-c".into(),
        STEPS_SCRIPT.into(),
        "stackroost".into(),
        dir.into(),
    ];
    for (i, step) in steps.iter().enumerate() {
        if i > 0 {
            args.push("::then::".into());
        }
        args.extend(step.iter().cloned());
    }
    (shell, args)
}

fn resolve_project_task(
    project_path: &str,
    task_id: &str,
    install_first: bool,
) -> AppResult<(String, Vec<String>)> {
    let home =
        crate::doctor::paths::home().ok_or_else(|| AppError::NotFound("HOME not set".into()))?;
    let dir = crate::services::projects::runner::check_project_dir(project_path, &home)
        .map_err(AppError::InvalidName)?;
    let steps = crate::services::projects::runner::resolve_steps(&dir, task_id, install_first)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            AppError::NotFound(format!("{task_id} isn't a task this project defines."))
        })?;
    Ok(project_task_argv(&dir.to_string_lossy(), &steps))
}

/// Server-side allowlist — JS passes a formula + kind, never a program. Resolves
/// the client binary (or a login shell) / the `tail -f` log command.
fn resolve_command(
    formula: &str,
    kind: &str,
    ctx: &AppContext,
) -> AppResult<(String, Vec<String>)> {
    validate::validate_formula(formula)?;
    // brew installs a tap formula under its bare name (opt/mongodb-community@7.0),
    // so every path and client lookup below drops the `user/repo/` prefix.
    let formula = validate::bare_formula(formula);
    let prefix = ctx.brew_prefix.as_deref().unwrap_or("/opt/homebrew");
    let base = formula.split('@').next().unwrap_or(formula);
    let bin = |name: &str| format!("{prefix}/bin/{name}");

    if kind == "logs" {
        let plist_file = format!("{prefix}/opt/{formula}/homebrew.mxcl.{formula}.plist");
        let log = std::fs::read_to_string(&plist_file)
            .ok()
            .and_then(|c| plist::log_path_from_plist(&c))
            .unwrap_or_else(|| format!("{prefix}/var/log/{base}.log"));
        return Ok(("tail".into(), vec!["-f".into(), log]));
    }

    let client = match base {
        "redis" | "valkey" => Some((bin("redis-cli"), vec![])),
        // psql defaults to a DB named after the OS user, which usually doesn't
        // exist — connect to the always-present `postgres` database instead.
        "postgresql" | "postgres" => Some((bin("psql"), vec!["-d".into(), "postgres".into()])),
        "mysql" | "mariadb" | "percona-server" => Some((bin("mysql"), vec![])),
        "mongodb" | "mongodb-community" => Some((bin("mongosh"), vec![])),
        _ => None,
    };
    match client {
        Some((path, args)) if std::path::Path::new(&path).exists() => Ok((path, args)),
        _ => {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
            Ok((shell, vec!["-l".into()]))
        }
    }
}

// All four are `async` so Tauri runs them off the main thread — a sync command
// runs ON the main thread, so an openpty/spawn or a write into a full PTY buffer
// would stall the UI (same pattern as the brew commands in commands/).
#[allow(clippy::too_many_arguments)]
pub async fn pty_open(
    id: String,
    target: PtyTarget,
    cols: u16,
    rows: u16,
    on_event: Channel<PtyEvent>,
    ctx: State<'_, AppContext>,
    remote: State<'_, RemoteState>,
    mgr: State<'_, PtyManager>,
) -> AppResult<()> {
    let (program, args) = resolve_target(&target, &ctx, &remote)?;
    mgr.open(id, target, program, args, cols, rows, on_event)
}

pub async fn pty_write(id: String, data: String, mgr: State<'_, PtyManager>) -> AppResult<()> {
    mgr.write(&id, data.as_bytes())
}

pub async fn pty_resize(
    id: String,
    cols: u16,
    rows: u16,
    mgr: State<'_, PtyManager>,
) -> AppResult<()> {
    mgr.resize(&id, cols, rows)
}

pub async fn pty_kill(id: String, mgr: State<'_, PtyManager>) -> AppResult<()> {
    mgr.kill(&id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_steps_run_as_arguments_in_zsh_and_bash() {
        let dir = std::env::temp_dir().join(format!("sr pty \"q\" $HOME {}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let steps = vec![
            vec![
                "printf".into(),
                "first:%s\\n".into(),
                "a b; echo pwned".into(),
            ],
            vec!["pwd".into()],
            vec!["false".into()],
            vec!["echo".into(), "never".into()],
        ];
        let (_, args) = project_task_argv(&dir.to_string_lossy(), &steps);
        // Skip the login/interactive flags: the test shouldn't load the
        // developer's rc files. Everything from `-c` on is what runs.
        let from_c = args.iter().position(|a| a == "-c").unwrap();
        for shell in ["/bin/zsh", "/bin/bash"] {
            let out = std::process::Command::new(shell)
                .args(&args[from_c..])
                .output()
                .unwrap();
            let text = String::from_utf8_lossy(&out.stdout);
            let err = String::from_utf8_lossy(&out.stderr);
            assert_eq!(out.status.code(), Some(1), "{shell}: {text} / {err}");
            assert!(text.contains("first:a b; echo pwned"), "{shell}: {text}");
            assert!(
                !text.contains("\npwned"),
                "{shell} ran injected text: {text}"
            );
            // `cd` reached the folder whose name holds quotes and `$HOME`
            // (pwd prints /var/…, canonicalize gives /private/var/…).
            assert!(text.contains("sr pty \"q\" $HOME"), "{shell}: {text}");
            assert!(
                text.contains("false exited with 1. Stopped."),
                "{shell}: {text}"
            );
            assert!(!text.contains("never"), "{shell}: {text}");
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn take_utf8_holds_back_split_codepoint() {
        // "€" = E2 82 AC. First batch ends mid-char; the tail must carry over.
        let mut acc = b"ok \xE2\x82".to_vec();
        assert_eq!(take_utf8(&mut acc), "ok ");
        assert_eq!(acc, b"\xE2\x82");
        acc.extend_from_slice(b"\xAC done");
        assert_eq!(take_utf8(&mut acc), "€ done");
        assert!(acc.is_empty());
    }

    #[test]
    fn targets_deserialize_from_the_js_shape() {
        let t: PtyTarget =
            serde_json::from_str(r#"{"type":"brew","formula":"redis","kind":"cli"}"#).unwrap();
        assert!(
            matches!(t, PtyTarget::Brew { ref formula, ref kind } if formula == "redis" && kind == "cli")
        );
        let t: PtyTarget =
            serde_json::from_str(r#"{"type":"remoteLogs","hostId":"h_1","container":"web"}"#)
                .unwrap();
        assert!(
            matches!(t, PtyTarget::RemoteLogs { ref host_id, ref container } if host_id == "h_1" && container == "web")
        );
        // A program can't be smuggled in: unknown fields are just ignored.
        let t: PtyTarget =
            serde_json::from_str(r#"{"type":"remoteShell","hostId":"h_1","program":"/bin/rm"}"#)
                .unwrap();
        assert!(matches!(t, PtyTarget::RemoteShell { .. }));
        assert!(serde_json::from_str::<PtyTarget>(r#"{"type":"local","cmd":"sh"}"#).is_err());
    }

    #[test]
    fn brew_target_resolves_exactly_as_before() {
        let ctx = AppContext {
            platform: "macos".into(),
            arch: "aarch64".into(),
            brew_prefix: Some("/nonexistent-prefix".into()),
            brew_bin: None,
            brew_version: None,
            max_ptys: MAX_PTYS,
        };
        let remote = RemoteState::load(std::env::temp_dir().join("nexus-pty-unused.json"));
        let t = PtyTarget::Brew {
            formula: "redis".into(),
            kind: "logs".into(),
        };
        let (prog, args) = resolve_target(&t, &ctx, &remote).unwrap();
        assert_eq!(prog, "tail");
        assert_eq!(args, ["-f", "/nonexistent-prefix/var/log/redis.log"]);
        assert_eq!(
            resolve_target(&t, &ctx, &remote).unwrap(),
            resolve_command("redis", "logs", &ctx).unwrap()
        );
        let bad = PtyTarget::Brew {
            formula: "redis; rm".into(),
            kind: "cli".into(),
        };
        assert!(resolve_target(&bad, &ctx, &remote).is_err());
    }

    #[test]
    fn remote_containers_must_be_in_the_latest_snapshot() {
        let remote = RemoteState::load(std::env::temp_dir().join("nexus-pty-unused2.json"));
        let t = PtyTarget::RemoteExec {
            host_id: "h_1".into(),
            container: "web".into(),
        };
        assert!(matches!(
            resolve_remote(&t, &remote),
            Err(AppError::NotFound(_))
        ));
        let t = PtyTarget::RemoteLogs {
            host_id: "h_1".into(),
            container: "--privileged".into(),
        };
        assert!(matches!(
            resolve_remote(&t, &remote),
            Err(AppError::InvalidName(_))
        ));
        let t = PtyTarget::RemoteShell {
            host_id: "h_nope".into(),
        };
        assert!(matches!(
            resolve_remote(&t, &remote),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn take_utf8_degrades_invalid_bytes_lossily() {
        let mut acc = b"a\xFFb".to_vec();
        assert_eq!(take_utf8(&mut acc), "a\u{FFFD}b");
        assert!(acc.is_empty());
    }

    // Proof that portable-pty spawns + streams on this machine. Ignored in CI.
    #[test]
    #[ignore]
    fn pty_spawns_and_reads() {
        let pair = native_pty_system()
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .unwrap();
        let mut cmd = CommandBuilder::new("echo");
        cmd.arg("nexus-pty-ok");
        let mut child = pair.slave.spawn_command(cmd).unwrap();
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().unwrap();
        let mut buf = [0u8; 512];
        let n = reader.read(&mut buf).unwrap();
        let out = String::from_utf8_lossy(&buf[..n]).into_owned();
        let _ = child.wait();
        assert!(out.contains("nexus-pty-ok"), "got: {out:?}");
    }

    #[test]
    #[ignore]
    fn pty_foreground_job_detects_busy() {
        let pair = native_pty_system()
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .unwrap();
        let mut cmd = CommandBuilder::new("/bin/sh");
        cmd.args(["-c", "set -m; sleep 5"]);
        let child = pair.slave.spawn_command(cmd).unwrap();
        drop(pair.slave);

        let writer = pair.master.take_writer().unwrap();
        let mut session = Session {
            writer,
            master: pair.master,
            child,
            target: PtyTarget::Brew {
                formula: "test".into(),
                kind: "cli".into(),
            },
            last_activity: Arc::new(AtomicU64::new(0)),
        };

        std::thread::sleep(std::time::Duration::from_millis(50));
        assert!(session.is_foreground_job_running());
        let _ = session.child.kill();
    }

    #[test]
    #[ignore]
    fn pty_foreground_job_idle_is_not_busy() {
        let pair = native_pty_system()
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .unwrap();
        let mut cmd = CommandBuilder::new("/bin/sh");
        cmd.args(["-i"]);
        let child = pair.slave.spawn_command(cmd).unwrap();
        drop(pair.slave);

        let writer = pair.master.take_writer().unwrap();
        let mut session = Session {
            writer,
            master: pair.master,
            child,
            target: PtyTarget::Brew {
                formula: "test".into(),
                kind: "cli".into(),
            },
            last_activity: Arc::new(AtomicU64::new(0)),
        };

        std::thread::sleep(std::time::Duration::from_millis(50));
        assert!(!session.is_foreground_job_running());
        let _ = session.child.kill();
    }
}
