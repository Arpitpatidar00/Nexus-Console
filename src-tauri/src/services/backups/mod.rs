use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs::Permissions;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRecord {
    pub id: String,
    pub source_type: String,
    pub source_name: String,
    pub target_file: String,
    pub size_bytes: u64,
    pub created_at: u64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupConfig {
    pub source: String,
    pub host_alias: Option<String>,
    pub engine: String,
    pub database: String,
    pub destination_dir: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupIndex {
    pub backups: Vec<BackupRecord>,
}

pub fn new_backup_id() -> String {
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("bkp_{t}")
}

impl BackupIndex {
    pub fn load(dir: &Path) -> Self {
        let path = dir.join("backups-index.json");
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, dir: &Path) -> AppResult<()> {
        let path = dir.join("backups-index.json");
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| AppError::Io(format!("serialize backups: {e}")))?;
        std::fs::write(&path, json)
            .map_err(|e| AppError::Io(format!("save backups index to {}: {e}", path.display())))
    }

    pub fn add(&mut self, record: BackupRecord) {
        self.backups.insert(0, record);
        self.backups.truncate(100);
    }

    pub fn remove(&mut self, id: &str) -> Option<BackupRecord> {
        if let Some(pos) = self.backups.iter().position(|b| b.id == id) {
            Some(self.backups.remove(pos))
        } else {
            None
        }
    }
}

pub fn create_database_backup(dir: &Path, config: BackupConfig) -> AppResult<BackupRecord> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let dest_dir = config
        .destination_dir
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| dir.join("backups"));
    std::fs::create_dir_all(&dest_dir)
        .map_err(|e| AppError::Io(format!("create backup dir: {e}")))?;

    let filename = format!(
        "{}-{}-{now}.dump",
        config.engine,
        config.database.replace('/', "_")
    );
    let target_file = dest_dir.join(&filename);

    let id = new_backup_id();

    if config.source == "remote" {
        let host = config.host_alias.as_deref().unwrap_or("default");
        let dump_cmd = match config.engine.as_str() {
            "postgres" => format!("pg_dump -Fc {}", config.database),
            "mysql" => format!("mysqldump --single-transaction {}", config.database),
            "mongo" => format!("mongodump --archive --db={}", config.database),
            _ => format!("pg_dump -Fc {}", config.database),
        };

        // Stream over SSH directly to local file
        let cmd = format!("ssh {host} '{dump_cmd}' > \"{}\"", target_file.display());
        let out = Command::new("sh")
            .arg("-c")
            .arg(&cmd)
            .output()
            .map_err(|e| AppError::Io(format!("backup streaming failed: {e}")))?;

        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr);
            return Err(AppError::Shell(format!("remote dump error: {stderr}")));
        }
    } else {
        // Local database dump
        let mut child = match config.engine.as_str() {
            "postgres" => Command::new("pg_dump")
                .args([
                    "-Fc",
                    &config.database,
                    "-f",
                    &target_file.to_string_lossy(),
                ])
                .spawn(),
            "mysql" => {
                let cmd = format!(
                    "mysqldump --single-transaction {} > \"{}\"",
                    config.database,
                    target_file.display()
                );
                Command::new("sh").arg("-c").arg(&cmd).spawn()
            }
            "mongo" => Command::new("mongodump")
                .args([
                    format!("--archive={}", target_file.display()),
                    format!("--db={}", config.database),
                ])
                .spawn(),
            _ => Command::new("pg_dump")
                .args([
                    "-Fc",
                    &config.database,
                    "-f",
                    &target_file.to_string_lossy(),
                ])
                .spawn(),
        }
        .map_err(|e| AppError::Io(format!("failed to spawn local dump: {e}")))?;

        let status = child
            .wait()
            .map_err(|e| AppError::Io(format!("dump wait error: {e}")))?;
        if !status.success() {
            return Err(AppError::Shell("local dump failed".into()));
        }
    }

    // Strictly enforce 0600 permissions
    if target_file.exists() {
        let _ = std::fs::set_permissions(&target_file, Permissions::from_mode(0o600));
    }

    let size_bytes = std::fs::metadata(&target_file)
        .map(|m| m.len())
        .unwrap_or(0);

    let record = BackupRecord {
        id,
        source_type: config.source,
        source_name: format!("{}:{}", config.engine, config.database),
        target_file: target_file.to_string_lossy().to_string(),
        size_bytes,
        created_at: now,
        status: "completed".into(),
    };

    let mut index = BackupIndex::load(dir);
    index.add(record.clone());
    index.save(dir)?;

    Ok(record)
}

pub fn backup_project_env(dir: &Path, project_path: &Path) -> AppResult<BackupRecord> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let dest_dir = dir.join("backups").join("env");
    std::fs::create_dir_all(&dest_dir)
        .map_err(|e| AppError::Io(format!("create env backup dir: {e}")))?;

    let proj_name = project_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();
    let target_file = dest_dir.join(format!("{proj_name}-env-{now}.tar.gz"));

    let cmd = format!(
        r#"tar -czf "{0}" -C "{1}" $(ls -a "{1}" | grep '^\.env' 2>/dev/null) 2>/dev/null"#,
        target_file.display(),
        project_path.display()
    );

    let _ = Command::new("sh").arg("-c").arg(&cmd).output();

    if target_file.exists() {
        let _ = std::fs::set_permissions(&target_file, Permissions::from_mode(0o600));
    }

    let size_bytes = std::fs::metadata(&target_file)
        .map(|m| m.len())
        .unwrap_or(0);
    let record = BackupRecord {
        id: new_backup_id(),
        source_type: "project-env".into(),
        source_name: proj_name.to_string(),
        target_file: target_file.to_string_lossy().to_string(),
        size_bytes,
        created_at: now,
        status: "completed".into(),
    };

    let mut index = BackupIndex::load(dir);
    index.add(record.clone());
    index.save(dir)?;

    Ok(record)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_backup_id() {
        let id = new_backup_id();
        assert!(id.starts_with("bkp_"));
    }
}
