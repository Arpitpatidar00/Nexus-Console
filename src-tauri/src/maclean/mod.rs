// Mac Clean — the user's `~/mac-clean.sh` as a module (docs/maclean/PLAN.md):
// storage report + safe cleanup of regenerable caches, and memory/swap.
// Reading is free; every deletion is a whitelisted item id, confirmed natively
// and journaled.

pub mod catalog;
pub mod disk;
pub mod measure;
pub mod scan;
pub mod store;
pub mod tools;

use crate::error::{AppError, AppResult};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Mutex, MutexGuard};
use store::Store;

/// Managed state: rules + journal (mirrored to `maclean.json`), the scan's
/// cancel flag, and a lock so only one scan runs at a time.
pub struct MacleanState {
    path: PathBuf,
    store: Mutex<Store>,
    pub cancel: AtomicBool,
    pub scanning: Mutex<()>,
}

impl MacleanState {
    pub fn load(path: PathBuf) -> MacleanState {
        MacleanState {
            store: Mutex::new(Store::load(&path)),
            path,
            cancel: AtomicBool::new(false),
            scanning: Mutex::new(()),
        }
    }

    pub fn read(&self) -> AppResult<MutexGuard<'_, Store>> {
        self.store
            .lock()
            .map_err(|_| AppError::Io("mac clean store lock poisoned".into()))
    }

    // ponytail: first writer is P2 (rules editor + clean journal).
    #[allow(dead_code)]
    pub fn write<T>(&self, f: impl FnOnce(&mut Store) -> AppResult<T>) -> AppResult<T> {
        let mut guard = self.read()?;
        let mut next = guard.clone();
        let out = f(&mut next)?;
        next.save(&self.path)?;
        *guard = next;
        Ok(out)
    }
}
