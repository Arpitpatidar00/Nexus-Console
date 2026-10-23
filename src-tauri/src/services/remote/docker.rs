use serde::{Deserialize, Serialize};
// Container actions (docs/remote/PLAN.md §4.8): a fixed argv built here from a
// validated ref that the server's own latest snapshot reported. Split into
// prepare → (native confirm, in the command) → execute, so the core is
// testable without an NSAlert.

use super::parse::docker::Container;
use super::ssh::{self, SshTarget};
use super::store::{Env, JournalEntry};
use super::RemoteState;
use crate::error::{AppError, AppResult};
use std::time::Duration;

/// `docker stop` waits up to 10s for a graceful exit before SIGKILL.
const ACTION_TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DockerAction {
    Start,
    Stop,
    Restart,
    Remove,
}

impl DockerAction {
    fn verb(self) -> &'static str {
        match self {
            DockerAction::Start => "start",
            DockerAction::Stop => "stop",
            DockerAction::Restart => "restart",
            DockerAction::Remove => "rm",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            DockerAction::Start => "Start",
            DockerAction::Stop => "Stop",
            DockerAction::Restart => "Restart",
            DockerAction::Remove => "Remove",
        }
    }

    pub fn journal_id(self) -> &'static str {
        match self {
            DockerAction::Start => "docker.start",
            DockerAction::Stop => "docker.stop",
            DockerAction::Restart => "docker.restart",
            DockerAction::Remove => "docker.remove",
        }
    }
}

/// The remote argv: constants plus the validated ref, nothing else.
pub fn argv(action: DockerAction, container: &str) -> [&str; 3] {
    ["docker", action.verb(), container]
}

/// Everything the confirm sheet and the exec need, resolved and checked.
pub struct Prepared {
    pub target: SshTarget,
    pub host_id: String,
    pub host_label: String,
    pub env: Env,
    pub action: DockerAction,
    /// Name rather than id: what the user recognises, and what the journal shows.
    pub container: String,
}

impl Prepared {
    /// Stop and remove are destructive anywhere; on prod, everything is.
    pub fn destructive(&self) -> bool {
        self.env == Env::Prod || matches!(self.action, DockerAction::Stop | DockerAction::Remove)
    }

    pub fn confirm_title(&self) -> String {
        format!("{} {}?", self.action.label(), self.container)
    }

    pub fn confirm_message(&self) -> String {
        let env = format!("{:?}", self.env).to_uppercase();
        let what = match self.action {
            DockerAction::Start => "The container starts with its existing configuration.",
            DockerAction::Stop => "Whatever it serves goes down until it's started again.",
            DockerAction::Restart => "It stops and starts again; requests in flight are dropped.",
            DockerAction::Remove => {
                "The stopped container is deleted. Its image and named volumes are kept."
            }
        };
        format!(
            "{} · {env}\n\nNexus will run:  docker {} {}\n\n{what}",
            self.host_label,
            self.action.verb(),
            self.container
        )
    }
}

fn check_allowed(action: DockerAction, c: &Container) -> AppResult<()> {
    let running = matches!(c.state.as_str(), "running" | "restarting" | "paused");
    if action == DockerAction::Remove && running {
        return Err(AppError::Forbidden(format!(
            "{} is still running. Stop it first.",
            c.name
        )));
    }
    Ok(())
}

pub fn prepare(
    state: &RemoteState,
    host_id: &str,
    container: &str,
    action: DockerAction,
) -> AppResult<Prepared> {
    let c = state.known_container(host_id, container)?;
    check_allowed(action, &c)?;
    let target = state.connected_target(host_id)?;
    let s = state.read()?;
    let host = s.host(host_id)?;
    Ok(Prepared {
        target,
        host_id: host.id.clone(),
        host_label: host.label.clone(),
        env: host.env,
        action,
        container: c.name,
    })
}

/// Run it, then journal the outcome either way.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ComposeAction {
    Start,
    Stop,
    Restart,
}

impl ComposeAction {
    pub fn verb(self) -> &'static str {
        match self {
            ComposeAction::Start => "start",
            ComposeAction::Stop => "stop",
            ComposeAction::Restart => "restart",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            ComposeAction::Start => "Start stack",
            ComposeAction::Stop => "Stop stack",
            ComposeAction::Restart => "Restart stack",
        }
    }
}

pub struct PreparedCompose {
    pub target: SshTarget,
    pub host_id: String,
    pub host_label: String,
    pub env: Env,
    pub project: String,
    pub action: ComposeAction,
}

impl PreparedCompose {
    pub fn destructive(&self) -> bool {
        self.env == Env::Prod || self.action == ComposeAction::Stop
    }

    pub fn confirm_title(&self) -> String {
        format!("{} {}?", self.action.label(), self.project)
    }

    pub fn confirm_message(&self) -> String {
        let env = format!("{:?}", self.env).to_uppercase();
        format!(
            "{} · {}
Runs `docker compose -p {} {}` across every container in this stack.",
            self.host_label,
            env,
            self.project,
            self.action.verb()
        )
    }
}

pub fn prepare_compose(
    state: &RemoteState,
    host_id: &str,
    project: &str,
    action: ComposeAction,
) -> AppResult<PreparedCompose> {
    crate::util::validate::validate_display_text("compose project", project)?;
    let (host, target) = {
        let s = state.read()?;
        let h = s.host(host_id)?.clone();
        let t = state.connected_target(host_id)?;
        (h, t)
    };
    Ok(PreparedCompose {
        target,
        host_id: host.id,
        host_label: host.label,
        env: host.env,
        project: project.to_string(),
        action,
    })
}

pub fn execute_compose(state: &RemoteState, p: &PreparedCompose) -> AppResult<()> {
    let argv = ["docker", "compose", "-p", &p.project, p.action.verb()];
    let res = ssh::exec(&p.target, &argv, None, Duration::from_secs(45));
    let now = std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let (result, msg) = match &res {
        Ok(out) => {
            if out.status.success() {
                ("ok", String::new())
            } else {
                ("error", String::from_utf8_lossy(&out.stderr).to_string())
            }
        }
        Err(e) => ("error", e.to_string()),
    };

    let _ = state.write(|s| {
        s.append_journal(JournalEntry {
            at_epoch: now,
            host_id: p.host_id.clone(),
            host_label: p.host_label.clone(),
            env: p.env,
            action: format!("compose.{}", p.action.verb()),
            target: p.project.clone(),
            result: result.into(),
            message: msg,
        });
        Ok(())
    });

    match res {
        Ok(out) if out.status.success() => Ok(()),
        Ok(out) => Err(AppError::Shell(
            String::from_utf8_lossy(&out.stderr).to_string(),
        )),
        Err(e) => Err(e),
    }
}

pub fn execute(state: &RemoteState, p: &Prepared) -> AppResult<()> {
    let result = ssh::exec(
        &p.target,
        &argv(p.action, &p.container),
        None,
        ACTION_TIMEOUT,
    )
    .and_then(|out| {
        if out.status.success() {
            Ok(())
        } else {
            let err = String::from_utf8_lossy(&out.stderr);
            let line = err
                .lines()
                .find(|l| !l.trim().is_empty())
                .unwrap_or("docker failed");
            Err(AppError::Shell(line.trim().to_string()))
        }
    });
    let entry = JournalEntry {
        at_epoch: crate::doctor::claude::now_epoch(),
        host_id: p.host_id.clone(),
        host_label: p.host_label.clone(),
        env: p.env,
        action: p.action.journal_id().into(),
        target: p.container.clone(),
        result: if result.is_ok() { "ok" } else { "error" }.into(),
        message: result
            .as_ref()
            .err()
            .map(|e| e.to_string())
            .unwrap_or_default(),
    };
    // Best-effort, like Doctor's journal: the action already happened.
    let _ = state.write(|s| {
        s.append_journal(entry);
        Ok(())
    });
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn container(state: &str) -> Container {
        Container {
            id: "abc123".into(),
            name: "web".into(),
            image: "nginx".into(),
            state: state.into(),
            status: String::new(),
            health: None,
            restart_count: 0,
            restart_policy: None,
            exit_code: None,
            cpu_pct: None,
            mem_bytes: None,
            ports: String::new(),
            compose_project: None,
            created_at: None,
        }
    }

    #[test]
    fn argv_is_constants_plus_the_ref() {
        assert_eq!(
            argv(DockerAction::Restart, "web"),
            ["docker", "restart", "web"]
        );
        assert_eq!(argv(DockerAction::Remove, "web"), ["docker", "rm", "web"]);
        assert_eq!(argv(DockerAction::Start, "web"), ["docker", "start", "web"]);
        assert_eq!(argv(DockerAction::Stop, "web"), ["docker", "stop", "web"]);
    }

    #[test]
    fn remove_only_when_not_running() {
        assert!(check_allowed(DockerAction::Remove, &container("running")).is_err());
        assert!(check_allowed(DockerAction::Remove, &container("restarting")).is_err());
        assert!(check_allowed(DockerAction::Remove, &container("exited")).is_ok());
        assert!(check_allowed(DockerAction::Stop, &container("running")).is_ok());
    }

    fn prepared(env: Env, action: DockerAction) -> Prepared {
        Prepared {
            target: SshTarget::alias("h"),
            host_id: "h_1".into(),
            host_label: "Fameo API".into(),
            env,
            action,
            container: "web".into(),
        }
    }

    #[test]
    fn prod_makes_every_action_destructive() {
        assert!(!prepared(Env::Dev, DockerAction::Restart).destructive());
        assert!(!prepared(Env::Staging, DockerAction::Start).destructive());
        assert!(prepared(Env::Dev, DockerAction::Stop).destructive());
        assert!(prepared(Env::Dev, DockerAction::Remove).destructive());
        assert!(prepared(Env::Prod, DockerAction::Start).destructive());
        assert!(prepared(Env::Prod, DockerAction::Restart).destructive());
    }

    #[test]
    fn confirm_names_host_env_and_the_exact_command() {
        let p = prepared(Env::Prod, DockerAction::Restart);
        assert_eq!(p.confirm_title(), "Restart web?");
        let m = p.confirm_message();
        assert!(m.starts_with("Fameo API · PROD"), "{m}");
        assert!(m.contains("docker restart web"));
    }

    #[test]
    fn unknown_or_malformed_containers_are_refused_before_ssh() {
        let dir = std::env::temp_dir().join(format!("nexus-docker-{}", std::process::id()));
        let st = RemoteState::load(dir.join(super::super::store::FILE_NAME));
        assert!(matches!(
            prepare(&st, "h_1", "web; rm -rf /", DockerAction::Stop),
            Err(AppError::InvalidName(_))
        ));
        assert!(matches!(
            prepare(&st, "h_1", "web", DockerAction::Stop),
            Err(AppError::NotFound(_))
        ));
    }
}
