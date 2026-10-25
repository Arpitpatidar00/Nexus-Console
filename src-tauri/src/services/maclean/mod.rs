// Mac Clean — the user's `~/mac-clean.sh` as a module (docs/maclean/PLAN.md):
// storage report + safe cleanup of regenerable caches, and memory/swap.
// Reading is free; every deletion is a whitelisted item id, confirmed natively
// and journaled.

pub mod appdata;
pub mod background;
pub mod catalog;
pub mod clean;
pub mod deep;
pub mod disk;
pub mod duplicates;
pub mod energy;
pub mod explore;
pub mod ghost;
pub mod measure;
pub mod memory;
pub mod projects;
pub mod scan;
pub mod store;
pub mod tools;
pub mod trends;

use crate::error::{AppError, AppResult};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Mutex, MutexGuard};
use store::Store;

/// Managed state: rules + journal (mirrored to `maclean.json`), the scan's
/// cancel flag, and one lock shared by scans and cleans so they never overlap.
pub struct MacleanState {
    path: PathBuf,
    store: Mutex<Store>,
    pub cancel: AtomicBool,
    pub scanning: Mutex<()>,
    pub memory: memory::Sampler,
    /// The latest storage report: deep scan subtracts its rows, and Reveal
    /// only accepts a large file this report listed.
    pub last_report: Mutex<Option<scan::StorageReport>>,
    /// The latest duplicate scan: deletion only accepts paths it listed, and
    /// never every copy of a group.
    pub last_duplicates: Mutex<Option<duplicates::DuplicateReport>>,
    /// Paths from the latest ghost-leftovers scan — Reveal accepts these too.
    pub last_ghost_paths: Mutex<Vec<String>>,
    /// Paths from the latest Deep Scan — Reveal accepts these too.
    pub last_deep_paths: Mutex<Vec<String>>,
    /// The latest Projects scan: cleaning only accepts artifacts it listed.
    pub last_projects: Mutex<Option<projects::ProjectsReport>>,
    /// One Projects scan or clean at a time (independent of the main scan).
    pub projects_busy: Mutex<()>,
    /// One Apps & AI scan or clean at a time.
    pub appdata_busy: Mutex<()>,
    /// The latest Apps & AI scan: cleaning only accepts its caches and backups.
    pub last_appdata: Mutex<Option<appdata::AppDataReport>>,
    /// PIDs Energy paused with SIGSTOP — resumable, and all resumed on quit.
    pub paused: Mutex<std::collections::BTreeSet<i32>>,
}

impl MacleanState {
    /// SIGCONT everything Energy paused — called on quit so nothing is left
    /// frozen after Stackroost is gone.
    pub fn resume_all_paused(&self) {
        if let Ok(mut paused) = self.paused.lock() {
            for pid in std::mem::take(&mut *paused) {
                // SAFETY: kill(2) with a plain signal has no memory preconditions.
                unsafe { libc::kill(pid, libc::SIGCONT) };
            }
        }
    }

    pub fn load(path: PathBuf) -> MacleanState {
        MacleanState {
            store: Mutex::new(Store::load(&path)),
            path,
            cancel: AtomicBool::new(false),
            scanning: Mutex::new(()),
            memory: memory::Sampler::default(),
            last_report: Mutex::new(None),
            last_duplicates: Mutex::new(None),
            last_ghost_paths: Mutex::new(Vec::new()),
            last_deep_paths: Mutex::new(Vec::new()),
            last_projects: Mutex::new(None),
            last_appdata: Mutex::new(None),
            projects_busy: Mutex::new(()),
            appdata_busy: Mutex::new(()),
            paused: Mutex::new(std::collections::BTreeSet::new()),
        }
    }

    pub fn read(&self) -> AppResult<MutexGuard<'_, Store>> {
        self.store
            .lock()
            .map_err(|_| AppError::Io("mac clean store lock poisoned".into()))
    }

    pub fn write<T>(&self, f: impl FnOnce(&mut Store) -> AppResult<T>) -> AppResult<T> {
        let mut guard = self.read()?;
        let mut next = guard.clone();
        let out = f(&mut next)?;
        next.save(&self.path)?;
        *guard = next;
        Ok(out)
    }
}
