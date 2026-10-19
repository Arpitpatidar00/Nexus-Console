// `remote.json`, owned by Rust (docs/remote/PLAN.md §3.1). The frontend only
// ever holds a host `id`; everything that reaches an ssh argv is resolved here.

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

pub const FILE_NAME: &str = "remote.json";
const VERSION: u32 = 1;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Consent {
    pub granted: bool,
    pub granted_at_epoch: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HostSource {
    SshConfig,
    Manual,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Env {
    Dev,
    Staging,
    Prod,
    Other,
}

/// A host added by hand (not in ssh_config). Every field is validated before
/// it lands here; `identity_file` is a path we pass to `ssh -i`, never read.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualTarget {
    pub hostname: String,
    pub user: String,
    pub port: u32,
    pub identity_file: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Host {
    pub id: String,
    pub source: HostSource,
    pub alias: Option<String>,
    pub manual: Option<ManualTarget>,
    pub label: String,
    pub project: String,
    pub env: Env,
    pub order: u32,
}

/// One remote mutation; the journal is newest first, capped at JOURNAL_CAP.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub at_epoch: u64,
    pub host_id: String,
    pub host_label: String,
    pub env: Env,
    pub action: String,
    pub target: String,
    pub result: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Store {
    pub version: u32,
    #[serde(default)]
    pub consent: Consent,
    #[serde(default)]
    pub hosts: Vec<Host>,
    #[serde(default)]
    pub journal: Vec<JournalEntry>,
}

impl Default for Store {
    fn default() -> Self {
        Store {
            version: VERSION,
            consent: Consent::default(),
            hosts: vec![],
            journal: vec![],
        }
    }
}

pub const DEFAULT_PROJECT: &str = "Ungrouped";
pub const JOURNAL_CAP: usize = 500;

impl Store {
    /// Missing file → defaults. Unreadable/corrupt file → defaults, with the
    /// bad file moved aside to `remote.json.corrupt` so nothing is silently lost.
    pub fn load(path: &Path) -> Store {
        let Ok(raw) = fs::read_to_string(path) else {
            return Store::default();
        };
        match serde_json::from_str::<Store>(&raw) {
            Ok(s) => s,
            Err(_) => {
                let _ = fs::rename(path, path.with_extension("json.corrupt"));
                Store::default()
            }
        }
    }

    /// Atomic: write a sibling temp file, then rename over the real one.
    pub fn save(&self, path: &Path) -> AppResult<()> {
        let io = |e: std::io::Error| AppError::Io(format!("saving {FILE_NAME}: {e}"));
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).map_err(io)?;
        }
        let json = serde_json::to_vec_pretty(self)
            .map_err(|e| AppError::Parse(format!("serializing {FILE_NAME}: {e}")))?;
        let tmp = path.with_extension("json.tmp");
        fs::write(&tmp, json).map_err(io)?;
        fs::rename(&tmp, path).map_err(io)
    }

    /// Reading ssh config (or anything derived from it) is gated here, in Rust.
    pub fn require_consent(&self) -> AppResult<()> {
        if self.consent.granted {
            Ok(())
        } else {
            Err(AppError::Forbidden("consent required".into()))
        }
    }

    pub fn host(&self, id: &str) -> AppResult<&Host> {
        self.hosts
            .iter()
            .find(|h| h.id == id)
            .ok_or_else(|| AppError::NotFound(format!("unknown host {id}")))
    }

    pub fn host_mut(&mut self, id: &str) -> AppResult<&mut Host> {
        self.hosts
            .iter_mut()
            .find(|h| h.id == id)
            .ok_or_else(|| AppError::NotFound(format!("unknown host {id}")))
    }

    pub fn has_alias(&self, alias: &str) -> bool {
        self.hosts.iter().any(|h| h.alias.as_deref() == Some(alias))
    }

    pub fn append_journal(&mut self, entry: JournalEntry) {
        self.journal.insert(0, entry);
        self.journal.truncate(JOURNAL_CAP);
    }

    pub fn next_order(&self) -> u32 {
        self.hosts.iter().map(|h| h.order + 1).max().unwrap_or(0)
    }
}

/// `h_` + 16 random hex chars from the kernel CSPRNG.
pub fn new_host_id() -> String {
    use std::io::Read;
    let mut buf = [0u8; 8];
    if fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut buf))
        .is_err()
    {
        // Unreachable on macOS; still unique enough for a local list.
        let n = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos() as u64);
        buf = n.to_le_bytes();
    }
    let hex: String = buf.iter().map(|b| format!("{b:02x}")).collect();
    format!("h_{hex}")
}

pub fn path_in(app_data_dir: PathBuf) -> PathBuf {
    app_data_dir.join(FILE_NAME)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("nexus-remote-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn host(id: &str, alias: &str, order: u32) -> Host {
        Host {
            id: id.into(),
            source: HostSource::SshConfig,
            alias: Some(alias.into()),
            manual: None,
            label: alias.into(),
            project: DEFAULT_PROJECT.into(),
            env: Env::Prod,
            order,
        }
    }

    #[test]
    fn missing_file_is_defaults_without_consent() {
        let s = Store::load(&tmp_dir("missing").join(FILE_NAME));
        assert!(!s.consent.granted);
        assert!(s.hosts.is_empty());
        assert!(matches!(s.require_consent(), Err(AppError::Forbidden(_))));
    }

    #[test]
    fn round_trips_through_disk() {
        let path = tmp_dir("roundtrip").join(FILE_NAME);
        let mut s = Store::default();
        s.consent.granted = true;
        s.hosts.push(host("h_1", "fameo-prod", 0));
        s.save(&path).unwrap();
        assert!(!path.with_extension("json.tmp").exists());

        let back = Store::load(&path);
        assert!(back.require_consent().is_ok());
        assert_eq!(
            back.host("h_1").unwrap().alias.as_deref(),
            Some("fameo-prod")
        );
        assert!(back.has_alias("fameo-prod"));
        assert_eq!(back.next_order(), 1);
        // The wire format is camelCase with lowercase envs.
        let raw = fs::read_to_string(&path).unwrap();
        assert!(raw.contains("\"source\": \"sshConfig\""));
        assert!(raw.contains("\"env\": \"prod\""));
        assert!(raw.contains("\"grantedAtEpoch\""));
    }

    #[test]
    fn corrupt_file_falls_back_and_keeps_a_backup() {
        let path = tmp_dir("corrupt").join(FILE_NAME);
        fs::write(&path, "{ not json").unwrap();
        let s = Store::load(&path);
        assert!(s.hosts.is_empty());
        assert!(!path.exists());
        assert_eq!(
            fs::read_to_string(path.with_extension("json.corrupt")).unwrap(),
            "{ not json"
        );
    }

    #[test]
    fn journal_is_newest_first_and_capped() {
        let mut s = Store::default();
        for i in 0..(JOURNAL_CAP + 5) {
            s.append_journal(JournalEntry {
                at_epoch: i as u64,
                host_id: "h_1".into(),
                host_label: "api".into(),
                env: Env::Prod,
                action: "docker.restart".into(),
                target: "web".into(),
                result: "ok".into(),
                message: String::new(),
            });
        }
        assert_eq!(s.journal.len(), JOURNAL_CAP);
        assert_eq!(s.journal[0].at_epoch, (JOURNAL_CAP + 4) as u64);
    }

    #[test]
    fn unknown_host_is_not_found() {
        assert!(matches!(
            Store::default().host("h_nope"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn host_ids_are_prefixed_hex_and_distinct() {
        let a = new_host_id();
        assert_eq!(a.len(), 18);
        assert!(a.starts_with("h_"));
        assert!(a[2..].bytes().all(|b| b.is_ascii_hexdigit()));
        assert_ne!(a, new_host_id());
    }
}
