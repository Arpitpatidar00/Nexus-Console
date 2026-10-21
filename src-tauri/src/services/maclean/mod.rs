// Mac Clean — the user's `~/mac-clean.sh` as a module (docs/maclean/PLAN.md):
// storage report + safe cleanup of regenerable caches, and memory/swap.
// Reading is free; every deletion is a whitelisted item id, confirmed natively
// and journaled.

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
}

impl MacleanState {
    pub fn load(path: PathBuf) -> MacleanState {
        MacleanState {
            store: Mutex::new(Store::load(&path)),
            path,
            cancel: AtomicBool::new(false),
            scanning: Mutex::new(()),
            memory: memory::Sampler::default(),
            last_report: Mutex::new(None),
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
