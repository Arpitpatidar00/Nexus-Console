// One unified, audit-compliant consent model for all external data sources (A-06).
// Enforced in Rust before reading:
// - ssh_config: ~/.ssh/config
// - aws_config: ~/.aws/config, ~/.aws/credentials
// - shell_history: ~/.zsh_history, ~/.bash_history
// - project_env: .env files in projects
// - library_scan: ~/Library caches and application files in Mac Clean

use crate::core::error::{AppError, AppResult};
use crate::core::store::{load_store, save_store};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const FILE_NAME: &str = "consent.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DataSource {
    SshConfig,
    AwsConfig,
    ShellHistory,
    ProjectEnv,
    LibraryScan,
}

impl DataSource {
    pub fn as_str(&self) -> &'static str {
        match self {
            DataSource::SshConfig => "ssh_config",
            DataSource::AwsConfig => "aws_config",
            DataSource::ShellHistory => "shell_history",
            DataSource::ProjectEnv => "project_env",
            DataSource::LibraryScan => "library_scan",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "ssh_config" => Some(DataSource::SshConfig),
            "aws_config" => Some(DataSource::AwsConfig),
            "shell_history" => Some(DataSource::ShellHistory),
            "project_env" => Some(DataSource::ProjectEnv),
            "library_scan" => Some(DataSource::LibraryScan),
            _ => None,
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            DataSource::SshConfig => "SSH Configuration (~/.ssh/config)",
            DataSource::AwsConfig => "AWS Configuration (~/.aws/)",
            DataSource::ShellHistory => "Shell History (~/.zsh_history, ~/.bash_history)",
            DataSource::ProjectEnv => "Project Environment Files (.env)",
            DataSource::LibraryScan => "Mac Clean Library Scan (~/Library)",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConsentRecord {
    pub source: String,
    pub name: String,
    pub granted: bool,
    pub granted_at_epoch: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConsentStore {
    #[serde(default)]
    pub sources: HashMap<String, ConsentRecord>,
}

static CACHED_CONSENT_DIR: Mutex<Option<PathBuf>> = Mutex::new(None);

pub fn set_consent_dir(dir: PathBuf) {
    let mut guard = CACHED_CONSENT_DIR.lock().unwrap_or_else(|e| e.into_inner());
    *guard = Some(dir);
}

pub fn get_consent_dir() -> PathBuf {
    let guard = CACHED_CONSENT_DIR.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(ref d) = *guard {
        return d.clone();
    }
    std::env::var("HOME")
        .ok()
        .map(|h| PathBuf::from(h).join(".stackroost"))
        .unwrap_or_else(|| PathBuf::from("."))
}

pub fn load_consent(dir: &Path) -> ConsentStore {
    load_store(dir.join(FILE_NAME))
}

pub fn save_consent(dir: &Path, store: &ConsentStore) -> AppResult<()> {
    save_store(dir.join(FILE_NAME), store, true)
}

fn granted_in(dir: &Path, source: DataSource) -> bool {
    load_consent(dir)
        .sources
        .get(source.as_str())
        .is_some_and(|r| r.granted)
}

/// Check if consent has been granted for the requested DataSource in Rust.
/// Returns Ok(()) if granted, or Err(AppError::Forbidden) with a clear message.
pub fn require_consent(source: DataSource) -> AppResult<()> {
    if granted_in(&get_consent_dir(), source) {
        return Ok(());
    }
    Err(AppError::Forbidden(format!(
        "Consent required for accessing: {}. Please grant access in Settings -> Privacy.",
        source.display_name()
    )))
}

/// Check boolean status without erroring
pub fn is_consent_granted(source: DataSource) -> bool {
    granted_in(&get_consent_dir(), source)
}

fn set_in(dir: &Path, source: DataSource, granted: bool) -> AppResult<ConsentRecord> {
    let mut store = load_consent(dir);
    let epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let record = ConsentRecord {
        source: source.as_str().to_string(),
        name: source.display_name().to_string(),
        granted,
        granted_at_epoch: if granted { Some(epoch) } else { None },
    };

    store
        .sources
        .insert(source.as_str().to_string(), record.clone());
    save_consent(dir, &store)?;
    Ok(record)
}

/// Set or update consent for a DataSource
pub fn set_consent(source: DataSource, granted: bool) -> AppResult<ConsentRecord> {
    set_in(&get_consent_dir(), source, granted)
}

const ALL_SOURCES: [DataSource; 5] = [
    DataSource::SshConfig,
    DataSource::AwsConfig,
    DataSource::ShellHistory,
    DataSource::ProjectEnv,
    DataSource::LibraryScan,
];

fn all_in(dir: &Path) -> Vec<ConsentRecord> {
    let store = load_consent(dir);
    ALL_SOURCES
        .iter()
        .map(|src| {
            store
                .sources
                .get(src.as_str())
                .cloned()
                .unwrap_or_else(|| ConsentRecord {
                    source: src.as_str().to_string(),
                    name: src.display_name().to_string(),
                    granted: false,
                    granted_at_epoch: None,
                })
        })
        .collect()
}

/// Return all data sources and their consent status for Settings -> Privacy view
pub fn get_all_consents() -> Vec<ConsentRecord> {
    all_in(&get_consent_dir())
}

fn revoke_all_in(dir: &Path) -> AppResult<()> {
    let mut store = load_consent(dir);
    for record in store.sources.values_mut() {
        record.granted = false;
        record.granted_at_epoch = None;
    }
    save_consent(dir, &store)
}

/// Revoke all consents across all sources
pub fn revoke_all() -> AppResult<()> {
    revoke_all_in(&get_consent_dir())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "stackroost_consent_test_{name}_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&p);
        let _ = std::fs::create_dir_all(&p);
        p
    }

    #[test]
    fn test_consent_default_is_denied() {
        let dir = tmp_dir("default");
        assert!(!granted_in(&dir, DataSource::AwsConfig));
        assert!(all_in(&dir).iter().all(|r| !r.granted));
    }

    #[test]
    fn test_grant_and_revoke_consent() {
        let dir = tmp_dir("grant_revoke");
        let record = set_in(&dir, DataSource::ShellHistory, true).unwrap();
        assert!(record.granted);
        assert!(record.granted_at_epoch.is_some());
        assert!(granted_in(&dir, DataSource::ShellHistory));
        assert!(!granted_in(&dir, DataSource::ProjectEnv));

        set_in(&dir, DataSource::ShellHistory, false).unwrap();
        assert!(!granted_in(&dir, DataSource::ShellHistory));
    }

    #[test]
    fn test_revoke_all() {
        let dir = tmp_dir("revoke_all");
        set_in(&dir, DataSource::SshConfig, true).unwrap();
        set_in(&dir, DataSource::AwsConfig, true).unwrap();
        assert_eq!(all_in(&dir).iter().filter(|c| c.granted).count(), 2);

        revoke_all_in(&dir).unwrap();
        assert_eq!(all_in(&dir).iter().filter(|c| c.granted).count(), 0);
    }

    #[test]
    fn consent_file_is_private() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tmp_dir("perms");
        set_in(&dir, DataSource::AwsConfig, true).unwrap();
        let mode = std::fs::metadata(dir.join(FILE_NAME))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
    }
}
