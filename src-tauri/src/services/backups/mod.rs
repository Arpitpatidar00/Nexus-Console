use std::fs::OpenOptions;
use std::os::unix::fs::OpenOptionsExt;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::core::error::{AppError, AppResult};
use crate::core::validate::DbName;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
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

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupConfig {
    pub source: String,
    pub host_alias: Option<String>,
    pub engine: String,
    pub database: String,
    pub destination_dir: Option<String>,
}

#[derive(Debug, Default, Clone, serde::Serialize, serde::Deserialize)]
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
        crate::core::store::load_store(dir.join("backups-index.json"))
    }

    pub fn save(&self, dir: &Path) -> AppResult<()> {
        crate::core::store::save_store(dir.join("backups-index.json"), self, false)
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
    // 1. Validate database name using DbName newtype (rejects shell characters, injection, spaces)
    let validated_db = DbName::try_from(config.database.as_str())?;
    let db_str = validated_db.as_str();

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

    let filename = format!("{}-{}-{now}.dump", config.engine, db_str);
    let target_file = dest_dir.join(&filename);

    // 2. Pre-create local destination file with strict 0600 mode (owner read/write only)
    let out_file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .mode(0o600)
        .open(&target_file)
        .map_err(|e| AppError::Io(format!("create destination file: {e}")))?;

    let id = new_backup_id();

    if config.source == "remote" {
        // Validate host alias (no flags, no shell characters)
        let host_alias = config.host_alias.as_deref().unwrap_or("default");
        crate::core::util::validate::validate_ssh_alias(host_alias)?;

        // Execute dump over SSH using strict argv array (zero remote persistence, stream to local file)
        let mut cmd = Command::new("ssh");
        cmd.arg(host_alias);
        cmd.arg("--");

        match config.engine.as_str() {
            "postgres" => {
                cmd.args(["pg_dump", "-Fc", db_str]);
            }
            "mysql" => {
                cmd.args(["mysqldump", "--single-transaction", db_str]);
            }
            "mongo" => {
                cmd.args(["mongodump", "--archive", &format!("--db={db_str}")]);
            }
            other => {
                return Err(AppError::InvalidName(format!(
                    "unsupported database engine: {other}"
                )));
            }
        }

        cmd.stdin(Stdio::null());
        cmd.stdout(out_file);
        cmd.stderr(Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| AppError::Shell(format!("failed to spawn remote dump: {e}")))?;
        let status = child
            .wait()
            .map_err(|e| AppError::Shell(format!("error waiting for remote dump: {e}")))?;

        if !status.success() {
            let mut stderr = String::new();
            if let Some(mut err_pipe) = child.stderr.take() {
                let _ = std::io::Read::read_to_string(&mut err_pipe, &mut stderr);
            }
            let _ = std::fs::remove_file(&target_file);
            return Err(AppError::Shell(format!("remote dump failed: {stderr}")));
        }
    } else {
        // Local database dump via strict argv
        match config.engine.as_str() {
            "postgres" => {
                let mut cmd = Command::new("pg_dump");
                cmd.args(["-Fc", db_str, "-f", &target_file.to_string_lossy()]);
                cmd.stdin(Stdio::null());
                cmd.stderr(Stdio::piped());
                let mut child = cmd
                    .spawn()
                    .map_err(|e| AppError::Shell(format!("failed to spawn pg_dump: {e}")))?;
                let status = child
                    .wait()
                    .map_err(|e| AppError::Shell(format!("pg_dump wait error: {e}")))?;
                if !status.success() {
                    let mut stderr = String::new();
                    if let Some(mut err_pipe) = child.stderr.take() {
                        let _ = std::io::Read::read_to_string(&mut err_pipe, &mut stderr);
                    }
                    let _ = std::fs::remove_file(&target_file);
                    return Err(AppError::Shell(format!("local pg_dump failed: {stderr}")));
                }
            }
            "mysql" => {
                let mut cmd = Command::new("mysqldump");
                cmd.args(["--single-transaction", db_str]);
                cmd.stdin(Stdio::null());
                cmd.stdout(out_file);
                cmd.stderr(Stdio::piped());
                let mut child = cmd
                    .spawn()
                    .map_err(|e| AppError::Shell(format!("failed to spawn mysqldump: {e}")))?;
                let status = child
                    .wait()
                    .map_err(|e| AppError::Shell(format!("mysqldump wait error: {e}")))?;
                if !status.success() {
                    let mut stderr = String::new();
                    if let Some(mut err_pipe) = child.stderr.take() {
                        let _ = std::io::Read::read_to_string(&mut err_pipe, &mut stderr);
                    }
                    let _ = std::fs::remove_file(&target_file);
                    return Err(AppError::Shell(format!("local mysqldump failed: {stderr}")));
                }
            }
            "mongo" => {
                let mut cmd = Command::new("mongodump");
                cmd.args([
                    format!("--archive={}", target_file.display()),
                    format!("--db={db_str}"),
                ]);
                cmd.stdin(Stdio::null());
                cmd.stderr(Stdio::piped());
                let mut child = cmd
                    .spawn()
                    .map_err(|e| AppError::Shell(format!("failed to spawn mongodump: {e}")))?;
                let status = child
                    .wait()
                    .map_err(|e| AppError::Shell(format!("mongodump wait error: {e}")))?;
                if !status.success() {
                    let mut stderr = String::new();
                    if let Some(mut err_pipe) = child.stderr.take() {
                        let _ = std::io::Read::read_to_string(&mut err_pipe, &mut stderr);
                    }
                    let _ = std::fs::remove_file(&target_file);
                    return Err(AppError::Shell(format!("local mongodump failed: {stderr}")));
                }
            }
            other => {
                let _ = std::fs::remove_file(&target_file);
                return Err(AppError::InvalidName(format!(
                    "unsupported database engine: {other}"
                )));
            }
        }
    }

    // Verify 0600 mode
    if let Ok(metadata) = std::fs::metadata(&target_file) {
        let mode = metadata.permissions().mode() & 0o777;
        if mode != 0o600 {
            let _ = std::fs::set_permissions(&target_file, std::fs::Permissions::from_mode(0o600));
        }
    }

    let size_bytes = std::fs::metadata(&target_file)
        .map(|m| m.len())
        .unwrap_or(0);

    let record = BackupRecord {
        id,
        source_type: config.source,
        source_name: format!("{}:{}", config.engine, db_str),
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
    if !project_path.exists() || !project_path.is_dir() {
        return Err(AppError::NotFound(format!(
            "project directory does not exist: {}",
            project_path.display()
        )));
    }

    // Read project directory and find all .env* files
    let mut env_files = Vec::new();
    let read_dir = std::fs::read_dir(project_path)
        .map_err(|e| AppError::Io(format!("read project directory: {e}")))?;

    for entry in read_dir.flatten() {
        if let Ok(file_type) = entry.file_type() {
            if file_type.is_file() {
                let file_name = entry.file_name().to_string_lossy().to_string();
                if file_name.starts_with(".env") {
                    env_files.push(file_name);
                }
            }
        }
    }

    if env_files.is_empty() {
        return Err(AppError::NotFound(
            "no .env files found in project directory".into(),
        ));
    }

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

    // Pre-create destination archive with strict 0600 mode
    let _ = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .mode(0o600)
        .open(&target_file)
        .map_err(|e| AppError::Io(format!("create env archive file: {e}")))?;

    // Run tar purely via argv (no shell string)
    let mut cmd = Command::new("tar");
    cmd.args([
        "-czf",
        &target_file.to_string_lossy(),
        "-C",
        &project_path.to_string_lossy(),
    ]);
    for f in &env_files {
        cmd.arg(f);
    }
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::Shell(format!("failed to spawn tar: {e}")))?;
    let status = child
        .wait()
        .map_err(|e| AppError::Shell(format!("tar wait error: {e}")))?;

    if !status.success() {
        let mut stderr = String::new();
        if let Some(mut err_pipe) = child.stderr.take() {
            let _ = std::io::Read::read_to_string(&mut err_pipe, &mut stderr);
        }
        let _ = std::fs::remove_file(&target_file);
        return Err(AppError::Shell(format!("tar archiving failed: {stderr}")));
    }

    // Verify 0600 mode
    if let Ok(metadata) = std::fs::metadata(&target_file) {
        let mode = metadata.permissions().mode() & 0o777;
        if mode != 0o600 {
            let _ = std::fs::set_permissions(&target_file, std::fs::Permissions::from_mode(0o600));
        }
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

    #[test]
    fn test_database_name_injection_rejected() {
        let tmp = std::env::temp_dir().join("stackroost_test_backup_injection");
        let _ = std::fs::create_dir_all(&tmp);

        let bad_config = BackupConfig {
            source: "local".into(),
            host_alias: None,
            engine: "postgres".into(),
            database: "mydb; rm -rf /".into(),
            destination_dir: Some(tmp.to_string_lossy().to_string()),
        };

        let res = create_database_backup(&tmp, bad_config);
        assert!(res.is_err());
        assert!(matches!(res.unwrap_err(), AppError::InvalidName(_)));
    }

    #[test]
    fn test_backup_project_env_creates_0600_archive() {
        let tmp = std::env::temp_dir().join("stackroost_test_env_proj");
        let proj = tmp.join("my_proj");
        let _ = std::fs::create_dir_all(&proj);
        let env_file = proj.join(".env.production");
        std::fs::write(&env_file, "SECRET_KEY=123456\n").unwrap();

        let res = backup_project_env(&tmp, &proj).unwrap();
        assert_eq!(res.source_type, "project-env");
        assert!(res.size_bytes > 0);

        let target = PathBuf::from(&res.target_file);
        assert!(target.exists());
        let mode = std::fs::metadata(&target).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "archive must be created with 0600 permissions");

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
