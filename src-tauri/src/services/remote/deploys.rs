use crate::core::error::{AppError, AppResult};
use crate::core::validate::{ComposeProject, ComposeService, ImageRef};
use crate::services::remote::ssh::{self, SshTarget};
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
    // 1. Validate compose project name
    let valid_project = ComposeProject::try_from(project)?;
    let proj_str = valid_project.as_str();

    // 2. Strict argv execution without shell string interpolation
    let out = ssh::exec(
        target,
        &["docker", "compose", "-p", proj_str, "config", "--images"],
        None,
        Duration::from_secs(15),
    )?;

    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut services = Vec::new();

    for line in stdout.lines() {
        let image = line.trim();
        if image.is_empty() {
            continue;
        }

        // Validate image ref
        if let Ok(valid_image) = ImageRef::try_from(image) {
            let img_str = valid_image.as_str();
            let digest_before = ssh::exec(
                target,
                &["docker", "inspect", "--format", "{{.Id}}", img_str],
                None,
                Duration::from_secs(10),
            )
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_else(|| "unknown".to_string());

            services.push(ServiceDigest {
                service: img_str.to_string(),
                image: img_str.to_string(),
                digest_before,
                digest_after: None,
            });
        }
    }

    let has_changes = !services.is_empty();
    Ok(DeployPreview {
        project: proj_str.to_string(),
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
    let valid_project = ComposeProject::try_from(project)?;
    let proj_str = valid_project.as_str();

    let preview = preview_deploy(target, proj_str)?;

    // Validate services if specified
    let mut valid_services = Vec::new();
    for s in &services {
        let valid_svc = ComposeService::try_from(s.as_str())?;
        valid_services.push(valid_svc.into_inner());
    }

    // 1. docker compose -p <proj> pull <services...>
    let mut pull_cmd = vec!["docker", "compose", "-p", proj_str, "pull"];
    for s in &valid_services {
        pull_cmd.push(s.as_str());
    }
    let pull_out = ssh::exec(target, &pull_cmd, None, Duration::from_secs(90))?;

    // 2. docker compose -p <proj> up -d <services...>
    let mut up_cmd = vec!["docker", "compose", "-p", proj_str, "up", "-d"];
    for s in &valid_services {
        up_cmd.push(s.as_str());
    }
    let up_out = ssh::exec(target, &up_cmd, None, Duration::from_secs(90))?;

    let mut combined_logs = String::new();
    combined_logs.push_str(&String::from_utf8_lossy(&pull_out.stdout));
    combined_logs.push('\n');
    combined_logs.push_str(&String::from_utf8_lossy(&up_out.stdout));

    let mut updated_services = Vec::new();
    for mut s in preview.services_to_update {
        let digest_after = ssh::exec(
            target,
            &["docker", "inspect", "--format", "{{.Id}}", s.image.as_str()],
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
        project: proj_str.to_string(),
        deployed_at: now,
        services: updated_services,
        status: "success".to_string(),
        message: format!("Successfully deployed compose stack {proj_str}"),
    };

    Ok(DeployResult {
        record,
        logs: combined_logs,
    })
}

pub fn rollback_deploy(target: &SshTarget, record: &DeployRecord) -> AppResult<DeployResult> {
    let valid_project = ComposeProject::try_from(record.project.as_str())?;
    let proj_str = valid_project.as_str();

    let mut logs = String::new();
    let mut rollback_services = Vec::new();

    for s in &record.services {
        if s.digest_before.is_empty() || s.digest_before == "unknown" {
            continue;
        }
        // docker tag <digest_before> <image>
        let tag_out = ssh::exec(
            target,
            &["docker", "tag", s.digest_before.as_str(), s.image.as_str()],
            None,
            Duration::from_secs(15),
        );
        if let Ok(to) = tag_out {
            logs.push_str(&String::from_utf8_lossy(&to.stdout));
        }

        rollback_services.push(ServiceDigest {
            service: s.service.clone(),
            image: s.image.clone(),
            digest_before: s.digest_after.clone().unwrap_or_else(|| "current".into()),
            digest_after: Some(s.digest_before.clone()),
        });
    }

    // docker compose -p <proj> up -d
    let up_out = ssh::exec(
        target,
        &["docker", "compose", "-p", proj_str, "up", "-d"],
        None,
        Duration::from_secs(60),
    )?;
    logs.push_str(&String::from_utf8_lossy(&up_out.stdout));

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let roll_record = DeployRecord {
        id: new_deploy_id(),
        host_id: record.host_id.clone(),
        project: proj_str.to_string(),
        deployed_at: now,
        services: rollback_services,
        status: "rolledBack".to_string(),
        message: format!("Rolled back stack {proj_str} to deploy {}", record.id),
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

    #[test]
    fn test_preview_deploy_rejects_injection() {
        let target = SshTarget::alias("localhost");
        let res = preview_deploy(&target, "my_app; rm -rf /");
        assert!(res.is_err());
        assert!(matches!(res.unwrap_err(), AppError::InvalidName(_)));
    }
}
