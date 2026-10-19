// Nexus Remote — the user's own Linux servers over the system ssh client
// (docs/remote/PLAN.md). Agentless and read-only by default: every remote
// mutation is a fixed argv, confirmed natively and journaled.

pub mod config;
pub mod docker;
pub mod findings;
pub mod parse;
pub mod probe;
pub mod ssh;
pub mod store;

use crate::error::{AppError, AppResult};
use probe::HostSnapshot;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};
use store::{HostSource, Store};

/// Managed state: the store (mirrored to `remote.json` on every write),
/// per-host locks so two probes of one host never overlap, and each host's
/// latest snapshot: container actions and terminals only accept a container
/// the server itself reported.
pub struct RemoteState {
    path: PathBuf,
    store: Mutex<Store>,
    host_locks: Mutex<HashMap<String, Arc<Mutex<()>>>>,
    snapshots: Mutex<HashMap<String, HostSnapshot>>,
}

impl RemoteState {
    pub fn load(path: PathBuf) -> RemoteState {
        RemoteState {
            store: Mutex::new(Store::load(&path)),
            path,
            host_locks: Mutex::default(),
            snapshots: Mutex::default(),
        }
    }

    /// Where to ssh for a host. ssh_config hosts resolve through the user's
    /// config, so they're consent-gated here.
    pub fn target(&self, id: &str) -> AppResult<ssh::SshTarget> {
        let s = self.read()?;
        let host = s.host(id)?;
        if host.source == HostSource::SshConfig {
            s.require_consent()?;
        }
        ssh::SshTarget::from_host(host)
    }

    pub fn remember_snapshot(&self, id: &str, snap: &HostSnapshot) {
        if let Ok(mut m) = self.snapshots.lock() {
            m.insert(id.to_string(), snap.clone());
        }
    }

    pub fn forget_snapshot(&self, id: &str) {
        if let Ok(mut m) = self.snapshots.lock() {
            m.remove(id);
        }
    }

    /// The container with this name or id in the host's latest snapshot.
    pub fn known_container(&self, id: &str, r: &str) -> AppResult<parse::docker::Container> {
        crate::util::validate::validate_container_ref(r)?;
        let m = self
            .snapshots
            .lock()
            .map_err(|_| AppError::Io("snapshot cache poisoned".into()))?;
        m.get(id)
            .and_then(|s| s.containers.iter().find(|c| c.name == r || c.id == r))
            .cloned()
            .ok_or_else(|| {
                AppError::NotFound(format!(
                    "{r} isn't in this server's latest check. Refresh and try again."
                ))
            })
    }

    pub fn read(&self) -> AppResult<MutexGuard<'_, Store>> {
        self.store
            .lock()
            .map_err(|_| AppError::Io("remote store lock poisoned".into()))
    }

    /// Mutate, then persist. A failed save rolls the in-memory copy back so
    /// memory and disk never disagree.
    pub fn write<T>(&self, f: impl FnOnce(&mut Store) -> AppResult<T>) -> AppResult<T> {
        let mut guard = self.read()?;
        let mut next = guard.clone();
        let out = f(&mut next)?;
        next.save(&self.path)?;
        *guard = next;
        Ok(out)
    }

    /// The host's exclusive lock, or `Busy` if another op on it is running.
    pub fn host_lock(&self, id: &str) -> AppResult<Arc<Mutex<()>>> {
        let mut locks = self
            .host_locks
            .lock()
            .map_err(|_| AppError::Io("host locks poisoned".into()))?;
        Ok(locks.entry(id.to_string()).or_default().clone())
    }

    /// Close every live master. Used on quit and when consent is revoked.
    pub fn disconnect_all(&self) {
        let targets: Vec<_> = match self.read() {
            Ok(s) => s
                .hosts
                .iter()
                .filter_map(|h| ssh::SshTarget::from_host(h).ok())
                .collect(),
            Err(_) => return,
        };
        // In parallel: this runs on quit, where each host's 3s cap would add up.
        std::thread::scope(|s| {
            for t in &targets {
                s.spawn(move || ssh::control_exit(t));
            }
        });
    }
}

/// Run `f` holding the host's lock; a concurrent op on the same host gets `Busy`.
pub fn with_host_lock<T>(
    state: &RemoteState,
    id: &str,
    f: impl FnOnce() -> AppResult<T>,
) -> AppResult<T> {
    let lock = state.host_lock(id)?;
    let _g = lock
        .try_lock()
        .map_err(|_| AppError::Busy("This server is already being checked.".into()))?;
    f()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_host_is_busy_other_host_is_not() {
        let dir = std::env::temp_dir().join(format!("nexus-remote-lock-{}", std::process::id()));
        let st = RemoteState::load(dir.join(store::FILE_NAME));
        let r = with_host_lock(&st, "h_a", || {
            let inner = with_host_lock(&st, "h_a", || Ok(()));
            assert!(matches!(inner, Err(AppError::Busy(_))));
            with_host_lock(&st, "h_b", || Ok(7))
        });
        assert_eq!(r.unwrap(), 7);
        assert!(with_host_lock(&st, "h_a", || Ok(())).is_ok());
    }

    #[test]
    fn failed_write_leaves_memory_untouched() {
        let dir = std::env::temp_dir().join(format!("nexus-remote-write-{}", std::process::id()));
        let st = RemoteState::load(dir.join(store::FILE_NAME));
        let r: AppResult<()> = st.write(|s| {
            s.consent.granted = true;
            Err(AppError::InvalidName("nope".into()))
        });
        assert!(r.is_err());
        assert!(!st.read().unwrap().consent.granted);

        st.write(|s| {
            s.consent.granted = true;
            Ok(())
        })
        .unwrap();
        assert!(Store::load(&dir.join(store::FILE_NAME)).consent.granted);
    }
}
