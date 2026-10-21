// `docker`, `containers`, `inspect`, `stats` and `compose` sections. `ps` is
// the list; inspect and stats are joined onto it by container id.

use super::{human_bytes, Section};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DockerState {
    Absent,
    NoPermission,
    DaemonDown,
    Ok,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerInfo {
    pub state: DockerState,
    pub version: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Container {
    pub id: String,
    pub name: String,
    pub image: String,
    /// created | running | paused | restarting | removing | exited | dead
    pub state: String,
    /// Docker's own human line, e.g. "Up 3 hours (healthy)".
    pub status: String,
    /// healthy | unhealthy | starting, or `None` without a healthcheck.
    pub health: Option<String>,
    pub restart_count: u32,
    pub restart_policy: Option<String>,
    /// Last exit code; only set when the container isn't running.
    pub exit_code: Option<i64>,
    pub cpu_pct: Option<f64>,
    pub mem_bytes: Option<u64>,
    pub ports: String,
    pub compose_project: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComposeProject {
    pub name: String,
    pub status: String,
    pub config_files: String,
}

pub fn parse_docker(sec: Option<&Section>) -> DockerInfo {
    match sec {
        Some(Section::Ok(v)) if !v.trim().is_empty() => DockerInfo {
            state: DockerState::Ok,
            version: Some(v.trim().to_string()),
        },
        Some(Section::Error(line)) if line.to_lowercase().contains("permission denied") => {
            DockerInfo {
                state: DockerState::NoPermission,
                version: None,
            }
        }
        Some(Section::Error(_)) | Some(Section::Ok(_)) => DockerInfo {
            state: DockerState::DaemonDown,
            version: None,
        },
        Some(Section::Absent) | None => DockerInfo {
            state: DockerState::Absent,
            version: None,
        },
    }
}

fn json_values(body: Option<&str>) -> Vec<Value> {
    let s = body.unwrap_or("").trim();
    if s.starts_with('[') {
        if let Ok(Value::Array(arr)) = serde_json::from_str::<Value>(s) {
            return arr;
        }
    }
    s.lines()
        .filter_map(|l| serde_json::from_str::<Value>(l.trim()).ok())
        .collect()
}

fn str_of(v: &Value, k: &str) -> String {
    v[k].as_str().unwrap_or("").to_string()
}

/// inspect line: `<id> <restartCount> <json policy> <json State>`.
struct Inspected {
    restart_count: u32,
    restart_policy: Option<String>,
    state: Value,
}

fn parse_inspect(body: Option<&str>) -> HashMap<String, Inspected> {
    body.unwrap_or("")
        .lines()
        .filter_map(|l| {
            let mut it = l.splitn(4, ' ');
            let id = it.next()?.to_string();
            let restart_count = it.next()?.parse().ok()?;
            let policy: Value = serde_json::from_str(it.next()?).ok()?;
            let state = serde_json::from_str(it.next()?).ok()?;
            let restart_policy = policy.as_str().filter(|p| !p.is_empty()).map(String::from);
            Some((
                id,
                Inspected {
                    restart_count,
                    restart_policy,
                    state,
                },
            ))
        })
        .collect()
}

/// `com.docker.compose.project=<name>` out of ps's comma-joined Labels.
fn compose_label(labels: &str) -> Option<String> {
    labels
        .split(',')
        .find_map(|kv| kv.strip_prefix("com.docker.compose.project="))
        .filter(|p| !p.is_empty())
        .map(String::from)
}

pub fn parse_containers(
    ps: Option<&str>,
    inspect: Option<&str>,
    stats: Option<&str>,
) -> Vec<Container> {
    let inspected = parse_inspect(inspect);
    let stats: Vec<Value> = json_values(stats);
    json_values(ps)
        .into_iter()
        .filter_map(|c| {
            let id = c["ID"].as_str()?.to_string();
            let ins = inspected.get(&id);
            let st = stats.iter().find(|s| {
                s["Container"].as_str() == Some(id.as_str())
                    || s["ID"]
                        .as_str()
                        .is_some_and(|short| !short.is_empty() && id.starts_with(short))
            });
            let state = str_of(&c, "State");
            let health = c["HealthStatus"]
                .as_str()
                .or_else(|| c["Health"].as_str())
                .or_else(|| ins.and_then(|i| i.state["Health"]["Status"].as_str()))
                .filter(|h| matches!(*h, "healthy" | "unhealthy" | "starting"))
                .map(String::from);

            let name = if !c["Names"].is_null() && !c["Names"].as_str().unwrap_or("").is_empty() {
                str_of(&c, "Names")
            } else {
                str_of(&c, "Name")
            };

            let compose_project = c["Labels"].as_str().and_then(compose_label).or_else(|| {
                c["Project"]
                    .as_str()
                    .filter(|p| !p.is_empty())
                    .map(String::from)
            });

            let ports = if !c["Ports"].is_null() && !c["Ports"].as_str().unwrap_or("").is_empty() {
                str_of(&c, "Ports")
            } else if let Some(publishers) = c["Publishers"].as_array() {
                publishers
                    .iter()
                    .filter_map(|p| {
                        let published = p.get("PublishedPort").and_then(|v| v.as_u64())?;
                        let target = p.get("TargetPort").and_then(|v| v.as_u64())?;
                        Some(format!("{published}->{target}"))
                    })
                    .collect::<Vec<String>>()
                    .join(", ")
            } else {
                String::new()
            };

            Some(Container {
                name,
                image: str_of(&c, "Image"),
                status: str_of(&c, "Status"),
                health,
                restart_count: ins.map_or(0, |i| i.restart_count),
                restart_policy: ins.and_then(|i| i.restart_policy.clone()),
                exit_code: ins
                    .filter(|_| state != "running")
                    .and_then(|i| i.state["ExitCode"].as_i64()),
                cpu_pct: st.and_then(|s| s["CPUPerc"].as_str()?.trim_end_matches('%').parse().ok()),
                // Stopped containers report "0B / 0B": that's no data, not zero.
                mem_bytes: st
                    .filter(|_| state == "running")
                    .and_then(|s| human_bytes(s["MemUsage"].as_str()?.split('/').next()?)),
                ports,
                compose_project,
                created_at: c["CreatedAt"].as_str().map(String::from),
                state,
                id,
            })
        })
        .collect()
}

pub fn parse_compose(body: Option<&str>) -> Vec<ComposeProject> {
    let Some(v) = body.and_then(|b| serde_json::from_str::<Value>(b.trim()).ok()) else {
        return vec![];
    };
    v.as_array()
        .map(|a| {
            a.iter()
                .map(|p| ComposeProject {
                    name: str_of(p, "Name"),
                    status: str_of(p, "Status"),
                    config_files: str_of(p, "ConfigFiles"),
                })
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn docker_states() {
        assert_eq!(parse_docker(None).state, DockerState::Absent);
        assert_eq!(
            parse_docker(Some(&Section::Absent)).state,
            DockerState::Absent
        );
        let ok = parse_docker(Some(&Section::Ok("29.9.1".into())));
        assert_eq!(
            (ok.state, ok.version.as_deref()),
            (DockerState::Ok, Some("29.9.1"))
        );
        let denied = Section::Error(
            "permission denied while trying to connect to the docker API at unix:///var/run/docker.sock".into(),
        );
        assert_eq!(parse_docker(Some(&denied)).state, DockerState::NoPermission);
        let down = Section::Error(
            "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?".into(),
        );
        assert_eq!(parse_docker(Some(&down)).state, DockerState::DaemonDown);
    }

    #[test]
    fn bad_lines_are_skipped() {
        let c = parse_containers(
            Some("not json\n{\"Names\":\"no-id\"}\n"),
            Some("x y z"),
            None,
        );
        assert!(c.is_empty());
        assert!(parse_compose(Some("oops")).is_empty());
    }
}
