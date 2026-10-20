use crate::error::{AppError, AppResult};
use crate::remote::ssh::{self, SshTarget};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceDigest {
    pub service: String,
    pub image: String,
    pub digest_before: String,
    pub digest_after: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployRecord {
    pub id: String,
    pub host_id: String,
    pub project: String,
    pub deployed_at: u64,
    pub services: Vec<ServiceDigest>,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployPreview {
    pub project: String,
    pub services_to_update: Vec<ServiceDigest>,
    pub has_changes: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployResult {
    pub record: DeployRecord,
    pub logs: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployStore {
    pub deploys: Vec<DeployRecord>,
}

pub fn new_deploy_id() -> String {
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("dep_{t}")
}

impl DeployStore {
    pub fn load(dir: &Path) -> DeployStore {
        let path = dir.join("remote-deploys.json");
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, dir: &Path) -> AppResult<()> {
        let path = dir.join("remote-deploys.json");
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| AppError::Io(format!("serialize deploys: {e}")))?;
        std::fs::write(&path, json)
            .map_err(|e| AppError::Io(format!("save deploys to {}: {e}", path.display())))
    }

    pub fn add(&mut self, record: DeployRecord) {
        self.deploys.retain(|d| d.id != record.id);
        self.deploys.insert(0, record);
        self.deploys.truncate(100);
    }

    pub fn history_for(&self, host_id: &str) -> Vec<DeployRecord> {
        self.deploys
            .iter()
            .filter(|d| d.host_id == host_id)
            .cloned()
            .collect()
    }

    pub fn get(&self, deploy_id: &str) -> Option<&DeployRecord> {
        self.deploys.iter().find(|d| d.id == deploy_id)
    }
}

pub fn preview_deploy(target: &SshTarget, project: &str) -> AppResult<DeployPreview> {
    let cmd = format!("docker compose -p {project} config --images 2>/dev/null || docker ps --filter label=com.docker.compose.project={project} --format '{{{{.Image}}}}'");
    let out = ssh::exec(target, &["sh", "-c", &cmd], None, Duration::from_secs(15))?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut services = Vec::new();

    for line in stdout.lines() {
        let image = line.trim();
        if image.is_empty() {
            continue;
        }
        let inspect_cmd = format!("docker inspect --format '{{{{.Id}}}}' {image} 2>/dev/null");
        let digest_before = ssh::exec(
            target,
            &["sh", "-c", &inspect_cmd],
            None,
            Duration::from_secs(10),
        )
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "unknown".to_string());

        services.push(ServiceDigest {
            service: image.to_string(),
            image: image.to_string(),
            digest_before,
            digest_after: None,
        });
    }

    let has_changes = !services.is_empty();
    Ok(DeployPreview {
        project: project.to_string(),
        services_to_update: services,
        has_changes,
    })
}

pub fn execute_deploy(
    target: &SshTarget,
    host_id: &str,
    project: &str,
    services: Vec<String>,
) -> AppResult<DeployResult> {
    let preview = preview_deploy(target, project)?;

    let svc_args = if services.is_empty() {
        String::new()
    } else {
        format!(" {}", services.join(" "))
    };
    let pull_up_cmd = format!(
        "docker compose -p {project} pull{svc_args} && docker compose -p {project} up -d{svc_args}"
    );
    let out = ssh::exec(
        target,
        &["sh", "-c", &pull_up_cmd],
        None,
        Duration::from_secs(90),
    )?;

    let mut updated_services = Vec::new();
    for mut s in preview.services_to_update {
        let inspect_cmd = format!(
            "docker inspect --format '{{{{.Id}}}}' {} 2>/dev/null",
            s.image
        );
        let digest_after = ssh::exec(
            target,
            &["sh", "-c", &inspect_cmd],
            None,
            Duration::from_secs(10),
        )
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());
        s.digest_after = digest_after;
        updated_services.push(s);
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let record = DeployRecord {
        id: new_deploy_id(),
        host_id: host_id.to_string(),
        project: project.to_string(),
        deployed_at: now,
        services: updated_services,
        status: "success".to_string(),
        message: format!("Successfully deployed compose stack {project}"),
    };

    Ok(DeployResult {
        record,
        logs: String::from_utf8_lossy(&out.stdout).to_string(),
    })
}

pub fn rollback_deploy(target: &SshTarget, record: &DeployRecord) -> AppResult<DeployResult> {
    let mut logs = String::new();
    let mut rollback_services = Vec::new();

    for s in &record.services {
        if s.digest_before.is_empty() || s.digest_before == "unknown" {
            continue;
        }
        let tag_cmd = format!("docker tag {} {} 2>/dev/null", s.digest_before, s.image);
        let _ = ssh::exec(
            target,
            &["sh", "-c", &tag_cmd],
            None,
            Duration::from_secs(15),
        );
        rollback_services.push(ServiceDigest {
            service: s.service.clone(),
            image: s.image.clone(),
            digest_before: s.digest_after.clone().unwrap_or_else(|| "current".into()),
            digest_after: Some(s.digest_before.clone()),
        });
    }

    let up_cmd = format!("docker compose -p {} up -d", record.project);
    let out = ssh::exec(
        target,
        &["sh", "-c", &up_cmd],
        None,
        Duration::from_secs(60),
    )?;
    logs.push_str(&String::from_utf8_lossy(&out.stdout));

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let roll_record = DeployRecord {
        id: new_deploy_id(),
        host_id: record.host_id.clone(),
        project: record.project.clone(),
        deployed_at: now,
        services: rollback_services,
        status: "rolledBack".to_string(),
        message: format!(
            "Rolled back stack {} to deploy {}",
            record.project, record.id
        ),
    };

    Ok(DeployResult {
        record: roll_record,
        logs,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deploy_store_add_and_truncate() {
        let mut store = DeployStore::default();
        for i in 0..105 {
            store.add(DeployRecord {
                id: format!("dep_{i}"),
                host_id: "host_1".into(),
                project: "app".into(),
                deployed_at: i as u64,
                services: vec![],
                status: "success".into(),
                message: "deployed".into(),
            });
        }
        assert_eq!(store.deploys.len(), 100);
        assert_eq!(store.deploys[0].id, "dep_104");
    }

    #[test]
    fn test_new_deploy_id() {
        let id = new_deploy_id();
        assert!(id.starts_with("dep_"));
    }
}
