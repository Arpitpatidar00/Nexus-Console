use crate::database::remote_store::JournalEntry;
use crate::error::AppResult;
use crate::services::remote::ssh::{self, SshTarget};
use crate::services::remote::RemoteState;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DockerSpaceItem {
    pub item_type: String,
    pub total: String,
    pub active: String,
    pub size: String,
    pub reclaimable: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServerDiskReport {
    pub docker_space: Vec<DockerSpaceItem>,
    pub journal_disk_usage: String,
    pub large_logs: Vec<(String, String)>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PruneResult {
    pub reclaimed: String,
    pub message: String,
}

const DISK_REPORT_SCRIPT: &str = r#"
echo "===DOCKER_DF==="
docker system df 2>/dev/null || true
echo "===JOURNAL_USAGE==="
journalctl --disk-usage 2>/dev/null || echo "Unavailable"
echo "===LOG_SIZES==="
du -sh /var/log/* 2>/dev/null | sort -hr | head -n 10 || true
"#;

pub fn get_disk_report(target: &SshTarget) -> AppResult<ServerDiskReport> {
    let out = ssh::exec(
        target,
        &["sh", "-s"],
        Some(DISK_REPORT_SCRIPT.as_bytes()),
        Duration::from_secs(15),
    )?;
    let text = String::from_utf8_lossy(&out.stdout);
    Ok(parse_disk_report(&text))
}

pub fn parse_disk_report(output: &str) -> ServerDiskReport {
    let mut docker_space = Vec::new();
    let mut journal_disk_usage = "Unavailable".to_string();
    let mut large_logs = Vec::new();

    let mut section = "";

    for line in output.lines().map(str::trim) {
        if line == "===DOCKER_DF===" {
            section = "docker";
            continue;
        } else if line == "===JOURNAL_USAGE===" {
            section = "journal";
            continue;
        } else if line == "===LOG_SIZES===" {
            section = "logs";
            continue;
        }

        match section {
            "docker" => {
                if !line.is_empty() && !line.starts_with("TYPE") && !line.starts_with("===") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 5 {
                        let item_type = parts[0].to_string();
                        let total = parts[1].to_string();
                        let active = parts[2].to_string();
                        let size = parts[3].to_string();
                        let reclaimable = parts[4..].join(" ");
                        docker_space.push(DockerSpaceItem {
                            item_type,
                            total,
                            active,
                            size,
                            reclaimable,
                        });
                    }
                }
            }
            "journal" => {
                if !line.is_empty() {
                    journal_disk_usage = line.to_string();
                }
            }
            "logs" if !line.is_empty() => {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    large_logs.push((parts[1].to_string(), parts[0].to_string()));
                }
            }
            _ => {}
        }
    }

    ServerDiskReport {
        docker_space,
        journal_disk_usage,
        large_logs,
    }
}

pub fn prune_build_cache(state: &RemoteState, host_id: &str) -> AppResult<PruneResult> {
    let (host, target) = {
        let s = state.read()?;
        let h = s.host(host_id)?.clone();
        let t = state.connected_target(host_id)?;
        (h, t)
    };

    let out = ssh::exec(
        &target,
        &["docker", "builder", "prune", "-f"],
        None,
        Duration::from_secs(60),
    )?;
    let text = String::from_utf8_lossy(&out.stdout);
    let reclaimed = text
        .lines()
        .find(|l| l.contains("Total reclaimed space:"))
        .unwrap_or("0B")
        .replace("Total reclaimed space:", "")
        .trim()
        .to_string();

    let now = std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let _ = state.write(|s| {
        s.append_journal(JournalEntry {
            at_epoch: now,
            host_id: host.id,
            host_label: host.label,
            env: host.env,
            action: "disk.prune_builder".into(),
            target: "docker builder cache".into(),
            result: "ok".into(),
            message: format!("Reclaimed {reclaimed}"),
        });
        Ok(())
    });

    Ok(PruneResult {
        reclaimed,
        message: text.to_string(),
    })
}

pub fn prune_dangling_images(state: &RemoteState, host_id: &str) -> AppResult<PruneResult> {
    let (host, target) = {
        let s = state.read()?;
        let h = s.host(host_id)?.clone();
        let t = state.connected_target(host_id)?;
        (h, t)
    };

    let out = ssh::exec(
        &target,
        &["docker", "image", "prune", "-f"],
        None,
        Duration::from_secs(60),
    )?;
    let text = String::from_utf8_lossy(&out.stdout);
    let reclaimed = text
        .lines()
        .find(|l| l.contains("Total reclaimed space:"))
        .unwrap_or("0B")
        .replace("Total reclaimed space:", "")
        .trim()
        .to_string();

    let now = std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let _ = state.write(|s| {
        s.append_journal(JournalEntry {
            at_epoch: now,
            host_id: host.id,
            host_label: host.label,
            env: host.env,
            action: "disk.prune_images".into(),
            target: "dangling images".into(),
            result: "ok".into(),
            message: format!("Reclaimed {reclaimed}"),
        });
        Ok(())
    });

    Ok(PruneResult {
        reclaimed,
        message: text.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_disk_report() {
        let fixture = r#"
===DOCKER_DF===
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          12        4         4.5GB     2.8GB (62%)
Containers      8         3         120MB     45MB (37%)
Local Volumes   3         2         1.2GB     300MB (25%)
Build Cache     35        0         2.1GB     2.1GB
===JOURNAL_USAGE===
Archived and active journals take up 144.0M in the file system.
===LOG_SIZES===
50M	/var/log/journal
12M	/var/log/syslog
5M	/var/log/nginx
"#;
        let report = parse_disk_report(fixture);
        assert_eq!(report.docker_space.len(), 4);
        assert_eq!(report.docker_space[0].item_type, "Images");
        assert_eq!(report.docker_space[0].size, "4.5GB");
        assert!(report.journal_disk_usage.contains("144.0M"));
        assert_eq!(report.large_logs.len(), 3);
        assert_eq!(report.large_logs[0].0, "/var/log/journal");
        assert_eq!(report.large_logs[0].1, "50M");
    }
}
