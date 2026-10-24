use crate::core::exec::{self, ExecOpts};
use crate::error::{AppError, AppResult};
use crate::remote::docker::{ComposeAction, DockerAction};
use crate::remote::parse::docker::Container;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Short timeout for read-only probes — these run on every poll tick, so a
/// hung `docker` CLI (daemon half-started, socket stuck) must not block the
/// thread indefinitely (AUDIT-2026-10-24 ARC-02).
fn probe_opts() -> ExecOpts {
    ExecOpts::default()
        .with_timeout(Duration::from_secs(5))
        .no_check_exit()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerRuntimeStatus {
    pub runtime: String,
    pub running: bool,
    pub container_count: usize,
    pub version: Option<String>,
}

pub fn probe_runtime() -> DockerRuntimeStatus {
    // 1. Detect context/runtime
    let context_out = exec::run("docker", &["context", "show"], probe_opts())
        .map(|o| o.stdout_str.trim().to_string())
        .unwrap_or_else(|_| "default".to_string());

    let runtime = if context_out.contains("orbstack") {
        "OrbStack".to_string()
    } else if context_out.contains("colima") {
        "Colima".to_string()
    } else {
        "Docker Desktop".to_string()
    };

    // 2. Check docker info
    let info_out = exec::run(
        "docker",
        &["info", "--format", "{{.ServerVersion}}"],
        probe_opts(),
    );

    match info_out {
        Ok(out) if out.status.success() => {
            let version = out.stdout_str.trim().to_string();
            let count_out = exec::run("docker", &["ps", "-q"], probe_opts())
                .map(|o| o.stdout_str.lines().count())
                .unwrap_or(0);

            DockerRuntimeStatus {
                runtime,
                running: true,
                container_count: count_out,
                version: if version.is_empty() {
                    None
                } else {
                    Some(version)
                },
            }
        }
        _ => DockerRuntimeStatus {
            runtime,
            running: false,
            container_count: 0,
            version: None,
        },
    }
}

pub fn list_containers() -> AppResult<Vec<Container>> {
    let out = exec::run(
        "docker",
        &[
            "ps",
            "-a",
            "--format",
            "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.State}}\t{{.Status}}\t{{.Ports}}\t{{.Label \"com.docker.compose.project\"}}\t{{.CreatedAt}}",
        ],
        probe_opts(),
    )
    .map_err(|e| AppError::Io(format!("list local containers: {e}")))?;

    if !out.status.success() {
        return Ok(Vec::new());
    }

    let stdout = out.stdout_str;
    let mut list = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 8 {
            continue;
        }

        let id = parts[0].to_string();
        let name = parts[1].to_string();
        let image = parts[2].to_string();
        let state = parts[3].to_string();
        let status = parts[4].to_string();
        let ports = parts[5].to_string();
        let compose_project = if parts[6].is_empty() {
            None
        } else {
            Some(parts[6].to_string())
        };
        let created_at = Some(parts[7].to_string());

        let health = if status.contains("(healthy)") {
            Some("healthy".to_string())
        } else if status.contains("(unhealthy)") {
            Some("unhealthy".to_string())
        } else if status.contains("(health: starting)") {
            Some("starting".to_string())
        } else {
            None
        };

        list.push(Container {
            id,
            name,
            image,
            state,
            status,
            health,
            restart_count: 0,
            restart_policy: None,
            exit_code: None,
            cpu_pct: None,
            mem_bytes: None,
            ports,
            compose_project,
            created_at,
        });
    }

    Ok(list)
}

/// AUDIT-2026-10-24 BUG-07: this used `.status()` (stderr discarded, no
/// timeout), so a failed remove on a running or paused container surfaced as
/// "docker rm X failed" with no reason. Now runs through `core::exec`, which
/// enforces a timeout and puts the real stderr in the error.
pub fn container_action(name: &str, action: DockerAction) -> AppResult<()> {
    let opts = ExecOpts::default().with_timeout(Duration::from_secs(30));
    match action {
        DockerAction::Start => exec::run("docker", &["start", name], opts).map(|_| ()),
        DockerAction::Stop => exec::run("docker", &["stop", name], opts).map(|_| ()),
        DockerAction::Restart => exec::run("docker", &["restart", name], opts).map(|_| ()),
        DockerAction::Remove => {
            // A plain `docker rm` refuses a running or paused container.
            // The confirm dialog already told the user removal is
            // destructive, so retry with `-f` (stops it first) rather than
            // failing with no way to proceed from the UI.
            match exec::run("docker", &["rm", name], opts.clone()) {
                Ok(_) => Ok(()),
                Err(_) => exec::run("docker", &["rm", "-f", name], opts).map(|_| ()),
            }
        }
    }
}

pub fn compose_action(project: &str, action: ComposeAction) -> AppResult<()> {
    let action_str = match action {
        ComposeAction::Start => "start",
        ComposeAction::Stop => "stop",
        ComposeAction::Restart => "restart",
    };
    let opts = ExecOpts::default().with_timeout(Duration::from_secs(60));
    exec::run("docker", &["compose", "-p", project, action_str], opts).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_docker_runtime_struct() {
        let status = DockerRuntimeStatus {
            runtime: "Docker Desktop".into(),
            running: false,
            container_count: 0,
            version: None,
        };
        assert!(!status.running);
    }

    // These don't require the Docker daemon to be running — only that a
    // failure (no daemon, no such container, `docker` not installed) comes
    // back with a real reason attached instead of the old bare
    // "docker rm <name> failed" with stderr dropped (AUDIT-2026-10-24 BUG-07).
    // They do assume no real container exists with this name.

    #[test]
    fn start_on_a_missing_container_reports_why() {
        let name = format!("stackroost-test-missing-{}", std::process::id());
        let err = container_action(&name, DockerAction::Start).unwrap_err();
        let msg = err.to_string();
        assert_ne!(
            msg,
            format!("docker start {name} failed"),
            "bare message leaked back in: {msg}"
        );
        assert!(msg.len() > 20, "expected a detailed error, got: {msg}");
    }

    #[test]
    fn remove_on_a_missing_container_retries_with_force_and_still_reports_why() {
        let name = format!("stackroost-test-missing-{}", std::process::id());
        let err = container_action(&name, DockerAction::Remove).unwrap_err();
        let msg = err.to_string();
        assert_ne!(
            msg,
            format!("docker rm {name} failed"),
            "bare message leaked back in: {msg}"
        );
        assert!(msg.len() > 20, "expected a detailed error, got: {msg}");
    }

    #[test]
    fn probe_runtime_never_panics_and_reports_not_running_when_the_daemon_is_down() {
        // No daemon assumed running; the point is just that this read-only
        // probe returns promptly (it now has a 5s timeout, AUDIT-2026-10-24
        // ARC-02) instead of hanging, and never panics regardless of what
        // `docker` is actually doing on this machine.
        let status = probe_runtime();
        assert!(!status.runtime.is_empty());
        if !status.running {
            assert_eq!(status.container_count, 0);
            assert!(status.version.is_none());
        }
    }

    #[test]
    fn list_containers_never_errors_on_spawn_when_docker_exists() {
        // Whether the daemon answers or not, a reachable `docker` binary
        // must not turn into an Err here — only a missing binary should.
        let result = list_containers();
        assert!(result.is_ok(), "{result:?}");
    }

    #[test]
    fn compose_action_on_a_missing_project_reports_why() {
        let project = format!("stackroost-test-missing-{}", std::process::id());
        let err = compose_action(&project, ComposeAction::Stop).unwrap_err();
        let msg = err.to_string();
        assert_ne!(
            msg,
            format!("compose stop {project} failed"),
            "bare message leaked back in: {msg}"
        );
        assert!(msg.len() > 20, "expected a detailed error, got: {msg}");
    }
}
