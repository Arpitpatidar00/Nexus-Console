use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::core::error::AppResult;

/// Category of state mutation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MutKind {
    Create,
    Update,
    Delete,
    Truncate,
    ExecMut,
}

/// Blast radius scope of the mutation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BlastRadius {
    /// Isolated to a specific user-owned file or scratch path
    LocalIsolated,
    /// System-wide local change (e.g. /etc/hosts, launchd, disk cleanup)
    LocalSystem,
    /// Remote staging or non-production server mutation
    RemoteNonProd,
    /// Remote production server mutation (always destructive confirmation)
    RemoteProd,
}

/// Specification for a mutation requiring authorization and journaling.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MutationSpec {
    pub title: String,
    pub message: String,
    pub action: String,
    pub kind: MutKind,
    pub blast_radius: BlastRadius,
    pub target: String,
    pub destructive: bool,
    pub prod: bool,
}

impl MutationSpec {
    pub fn new<T: Into<String>, M: Into<String>, A: Into<String>>(
        title: T,
        message: M,
        action: A,
    ) -> Self {
        Self {
            title: title.into(),
            message: message.into(),
            action: action.into(),
            kind: MutKind::Update,
            blast_radius: BlastRadius::LocalIsolated,
            target: String::new(),
            destructive: false,
            prod: false,
        }
    }

    pub fn kind(mut self, kind: MutKind) -> Self {
        self.kind = kind;
        self
    }

    pub fn blast_radius(mut self, radius: BlastRadius) -> Self {
        self.blast_radius = radius;
        self
    }

    pub fn target<S: Into<String>>(mut self, target: S) -> Self {
        self.target = target.into();
        self
    }

    pub fn destructive(mut self, destructive: bool) -> Self {
        self.destructive = destructive;
        self
    }

    pub fn prod(mut self, prod: bool) -> Self {
        self.prod = prod;
        if prod {
            self.destructive = true;
            self.blast_radius = BlastRadius::RemoteProd;
        }
        self
    }
}

/// An entry appended to the append-only mutation journal.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MutationJournalEntry {
    pub id: String,
    pub epoch_secs: u64,
    pub kind: MutKind,
    pub blast_radius: BlastRadius,
    pub target: String,
    pub action: String,
    pub destructive: bool,
    pub prod: bool,
    pub outcome: String,
    pub detail: Option<String>,
    pub elapsed_ms: u64,
}

type OutcomeSlot = Arc<Mutex<Option<(String, Option<String>)>>>;

/// RAII Guard that journals the mutation outcome when dropped.
pub struct MutationGuard {
    pub id: String,
    pub spec: MutationSpec,
    start: Instant,
    outcome: OutcomeSlot,
    completed: Arc<AtomicBool>,
}

impl MutationGuard {
    pub fn new(spec: MutationSpec) -> Self {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let id = format!("mut-{ts}");
        Self {
            id,
            spec,
            start: Instant::now(),
            outcome: Arc::new(Mutex::new(None)),
            completed: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn success<D: Into<String>>(&self, detail: D) {
        if let Ok(mut lock) = self.outcome.lock() {
            *lock = Some(("success".to_string(), Some(detail.into())));
            self.completed.store(true, Ordering::SeqCst);
        }
    }

    pub fn failure<D: Into<String>>(&self, detail: D) {
        if let Ok(mut lock) = self.outcome.lock() {
            *lock = Some(("failed".to_string(), Some(detail.into())));
            self.completed.store(true, Ordering::SeqCst);
        }
    }
}

impl Drop for MutationGuard {
    fn drop(&mut self) {
        let elapsed_ms = self.start.elapsed().as_millis() as u64;
        let epoch_secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let (outcome, detail) = if let Ok(lock) = self.outcome.lock() {
            lock.clone().unwrap_or_else(|| {
                if std::thread::panicking() {
                    ("panicked".to_string(), Some("thread panicked".to_string()))
                } else {
                    ("completed".to_string(), None)
                }
            })
        } else {
            ("poisoned".to_string(), None)
        };

        let entry = MutationJournalEntry {
            id: self.id.clone(),
            epoch_secs,
            kind: self.spec.kind,
            blast_radius: self.spec.blast_radius,
            target: self.spec.target.clone(),
            action: self.spec.action.clone(),
            destructive: self.spec.destructive,
            prod: self.spec.prod,
            outcome,
            detail,
            elapsed_ms,
        };

        let _ = append_journal_entry(&entry);
    }
}

fn journal_path() -> Option<PathBuf> {
    dirs_home().map(|h| h.join(".config").join("stackroost").join("mutations.jsonl"))
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var("HOME").ok().map(PathBuf::from)
}

fn append_journal_entry(entry: &MutationJournalEntry) -> std::io::Result<()> {
    if let Some(path) = journal_path() {
        if let Some(parent) = path.parent() {
            let _ = create_dir_all(parent);
        }
        let mut file = OpenOptions::new().create(true).append(true).open(path)?;
        if let Ok(json) = serde_json::to_string(entry) {
            writeln!(file, "{json}")?;
        }
    }
    Ok(())
}

/// The mutation gate entry point.
/// Enforces native confirmation and returns a `MutationGuard` that journals on drop.
pub fn mutation(app: &tauri::AppHandle, mut spec: MutationSpec) -> AppResult<MutationGuard> {
    // If prod or blast radius is RemoteProd, always enforce destructive confirmation styling
    if spec.prod || spec.blast_radius == BlastRadius::RemoteProd {
        spec.destructive = true;
    }

    crate::commands::confirm_action(
        app,
        &spec.title,
        &spec.message,
        &spec.action,
        spec.destructive,
    )?;

    Ok(MutationGuard::new(spec))
}

/// Unattended mutation guard for unit tests where UI confirmations cannot be presented.
pub fn mutation_unattended(mut spec: MutationSpec) -> MutationGuard {
    if spec.prod || spec.blast_radius == BlastRadius::RemoteProd {
        spec.destructive = true;
    }
    MutationGuard::new(spec)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mutation_spec_prod_enforces_destructive() {
        let spec = MutationSpec::new("Restart", "Restart service in prod", "Restart")
            .prod(true)
            .target("api-server");

        assert!(spec.destructive);
        assert_eq!(spec.blast_radius, BlastRadius::RemoteProd);
    }

    #[test]
    fn mutation_guard_records_outcome() {
        let spec = MutationSpec::new("Delete Cache", "Clear cache", "Clear")
            .kind(MutKind::Delete)
            .blast_radius(BlastRadius::LocalSystem)
            .target("/tmp/cache");

        let guard = mutation_unattended(spec);
        guard.success("freed 10MB");
        drop(guard);
    }
}
