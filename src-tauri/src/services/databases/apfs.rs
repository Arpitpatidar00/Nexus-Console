use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbSnapshot {
    pub id: String,
    pub service: String,
    pub label: String,
    pub path: String,
    pub created_at: u64,
    pub size_bytes: u64,
}

#[cfg(target_os = "macos")]
pub fn is_apfs(path: &Path) -> bool {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;
    if let Ok(c_path) = CString::new(path.as_os_str().as_bytes()) {
        let mut stat: libc::statfs = unsafe { std::mem::zeroed() };
        if unsafe { libc::statfs(c_path.as_ptr(), &mut stat) } == 0 {
            let fstypename = unsafe { std::ffi::CStr::from_ptr(stat.f_fstypename.as_ptr()) };
            return fstypename.to_string_lossy().to_lowercase().contains("apfs");
        }
    }
    false
}

#[cfg(not(target_os = "macos"))]
pub fn is_apfs(_path: &Path) -> bool {
    false
}

#[cfg(target_os = "macos")]
pub fn clonefile(src: &Path, dst: &Path) -> AppResult<()> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;
    let c_src = CString::new(src.as_os_str().as_bytes())
        .map_err(|e| AppError::Io(format!("invalid src path: {e}")))?;
    let c_dst = CString::new(dst.as_os_str().as_bytes())
        .map_err(|e| AppError::Io(format!("invalid dst path: {e}")))?;

    let rc = unsafe { libc::clonefile(c_src.as_ptr(), c_dst.as_ptr(), 0) };
    if rc != 0 {
        let err = std::io::Error::last_os_error();
        return Err(AppError::Io(format!("APFS clonefile failed: {err}")));
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn clonefile(_src: &Path, _dst: &Path) -> AppResult<()> {
    Err(AppError::InvalidOperation(
        "clonefile is macOS APFS only".into(),
    ))
}

fn validate_service_name(svc: &str) -> AppResult<()> {
    if svc.is_empty()
        || svc.len() > 64
        || !svc
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(AppError::InvalidName(format!(
            "invalid service name: {svc}"
        )));
    }
    Ok(())
}

fn validate_local_path(p: &Path) -> AppResult<()> {
    let s = p.to_string_lossy();
    if s.is_empty() || s.contains('\0') || s.contains("..") {
        return Err(AppError::Forbidden("path traversal or invalid path".into()));
    }
    Ok(())
}

pub fn measure_dir_size_bytes(dir: &Path) -> u64 {
    if let Some(s) = dir.to_str() {
        let opts =
            crate::core::exec::ExecOpts::default().with_timeout(std::time::Duration::from_secs(5));
        if let Ok(out) = crate::core::exec::run("du", &["-sk", s], opts) {
            let text = String::from_utf8_lossy(&out.stdout);
            if let Some(first) = text.split_whitespace().next() {
                if let Ok(kb) = first.parse::<u64>() {
                    return kb * 1024;
                }
            }
        }
    }
    0
}

fn list_snapshots_in(dir: &Path, service_data_dir: &Path) -> Vec<DbSnapshot> {
    let mut list = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let name = p
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let parts: Vec<&str> = name.splitn(2, '_').collect();
                let created_at = parts[0].parse::<u64>().unwrap_or(0);
                let label = if parts.len() > 1 {
                    parts[1].to_string()
                } else {
                    "snapshot".to_string()
                };
                let size_bytes = measure_dir_size_bytes(&p);

                list.push(DbSnapshot {
                    id: name.clone(),
                    service: service_data_dir
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string(),
                    label,
                    path: p.to_string_lossy().to_string(),
                    created_at,
                    size_bytes,
                });
            }
        }
    }
    list
}

pub fn list_snapshots(service_data_dir: &Path) -> Vec<DbSnapshot> {
    if validate_local_path(service_data_dir).is_err() {
        return Vec::new();
    }
    let snap_dir = snapshot_parent_dir(service_data_dir);
    let legacy_dir = legacy_snapshot_parent_dir(service_data_dir);

    // The snapshot folder used to be named `-nexus-snapshots` (AUDIT-2026-10-24
    // ARC-06). Try a one-time rename to the current name; if that fails for
    // any reason (cross-device, permissions), still read both so a snapshot
    // someone already made never silently disappears from the list.
    if legacy_dir.exists() && !snap_dir.exists() {
        let _ = std::fs::rename(&legacy_dir, &snap_dir);
    }

    let mut list = list_snapshots_in(&snap_dir, service_data_dir);
    if legacy_dir.exists() && legacy_dir != snap_dir {
        let seen: std::collections::HashSet<String> = list.iter().map(|s| s.id.clone()).collect();
        list.extend(
            list_snapshots_in(&legacy_dir, service_data_dir)
                .into_iter()
                .filter(|s| !seen.contains(&s.id)),
        );
    }

    list.sort_by_key(|a| std::cmp::Reverse(a.created_at));
    list
}

pub fn snapshot_parent_dir(data_dir: &Path) -> PathBuf {
    let dir_name = data_dir.file_name().unwrap_or_default().to_string_lossy();
    let parent = data_dir.parent().unwrap_or(data_dir);
    parent.join(format!("{dir_name}-db-snapshots"))
}

/// The pre-rename snapshot folder name (AUDIT-2026-10-24 ARC-06). Only used
/// by `list_snapshots`'s one-time migration and as a read fallback — nothing
/// writes new snapshots here.
fn legacy_snapshot_parent_dir(data_dir: &Path) -> PathBuf {
    let dir_name = data_dir.file_name().unwrap_or_default().to_string_lossy();
    let parent = data_dir.parent().unwrap_or(data_dir);
    parent.join(format!("{dir_name}-nexus-snapshots"))
}

/// Checks `service_name`, if given, for the caller's `validate_service_name`
/// call before any stop/start — kept here so both commands validate the same way.
pub fn check_service_name(svc: &str) -> AppResult<()> {
    validate_service_name(svc)
}

/// Clone `data_dir` into a new snapshot directory. The caller (commands layer,
/// which owns `BrewLock` and `ServicesCache`) must stop the service first and
/// confirm it is actually stopped — this function only clones and never
/// touches brew (AUDIT-2026-10-24 BUG-01).
pub fn create_snapshot(
    service_label: Option<&str>,
    data_dir: &Path,
    label: &str,
) -> AppResult<DbSnapshot> {
    validate_local_path(data_dir)?;
    if !data_dir.exists() {
        return Err(AppError::NotFound(format!(
            "data dir {}",
            data_dir.display()
        )));
    }

    // Ensure snapshot parent directory exists
    let snap_parent = snapshot_parent_dir(data_dir);
    std::fs::create_dir_all(&snap_parent)
        .map_err(|e| AppError::Io(format!("create snapshot dir: {e}")))?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let clean_label = label.replace(|c: char| !c.is_alphanumeric() && c != '-', "_");
    let snap_name = format!("{now}_{clean_label}");
    let snap_path = snap_parent.join(&snap_name);

    // APFS CoW clone — the only filesystem mutation this function makes.
    clonefile(data_dir, &snap_path)?;

    let size_bytes = measure_dir_size_bytes(&snap_path);

    Ok(DbSnapshot {
        id: snap_name,
        service: service_label.unwrap_or("database").to_string(),
        label: label.to_string(),
        path: snap_path.to_string_lossy().to_string(),
        created_at: now,
        size_bytes,
    })
}

/// Restore `data_dir` from `snapshot_path`. The caller must stop the service
/// first and confirm it is stopped. The current data directory is moved aside
/// (never deleted) and only overwritten if that move succeeds — previously a
/// failed `rename` was ignored and the clone proceeded into a directory that
/// still held the live, running database (AUDIT-2026-10-24 BUG-01).
pub fn restore_snapshot(data_dir: &Path, snapshot_path: &Path) -> AppResult<()> {
    validate_local_path(data_dir)?;
    validate_local_path(snapshot_path)?;
    if !snapshot_path.exists() {
        return Err(AppError::NotFound(format!(
            "snapshot {}",
            snapshot_path.display()
        )));
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // Move the current data dir aside to <data_dir>.before-restore-<now>.
    // Abort instead of cloning over it if this fails.
    let backup_path = data_dir.with_extension(format!("before-restore-{now}"));
    if data_dir.exists() {
        std::fs::rename(data_dir, &backup_path).map_err(|e| {
            AppError::Io(format!(
                "could not move aside the current data directory before restoring \
                 (nothing was changed): {e}"
            ))
        })?;
    }

    // Clone snapshot back to data_dir. If this fails, the pre-restore backup
    // is still at `backup_path` — surface that in the error instead of leaving
    // the data directory missing with no indication where its contents went.
    clonefile(snapshot_path, data_dir).map_err(|e| {
        AppError::Io(format!(
            "{e}; the previous data directory was moved to {} and was not restored",
            backup_path.display()
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_old_nexus_snapshots_dir_is_migrated_and_still_listed() {
        let dir = std::env::temp_dir().join(format!(
            "sr-apfs-migrate-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        let data_dir = dir.join("postgresql@16");
        std::fs::create_dir_all(&data_dir).unwrap();

        // A snapshot made under the old suffix, before anything in this
        // process ever asks for the new one.
        let legacy_parent = legacy_snapshot_parent_dir(&data_dir);
        std::fs::create_dir_all(legacy_parent.join("1700000000_before_migration")).unwrap();

        let found = list_snapshots(&data_dir);
        assert_eq!(found.len(), 1, "{found:?}");
        assert_eq!(found[0].id, "1700000000_before_migration");

        // The migration moved it: the old folder is gone, the new one has it.
        assert!(
            !legacy_parent.exists(),
            "legacy snapshot dir should be renamed away"
        );
        assert!(snapshot_parent_dir(&data_dir)
            .join("1700000000_before_migration")
            .exists());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn snapshots_under_old_and_new_names_are_both_listed_if_migration_cannot_run() {
        let dir = std::env::temp_dir().join(format!(
            "sr-apfs-both-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        let data_dir = dir.join("postgresql@16");
        std::fs::create_dir_all(&data_dir).unwrap();

        // Both exist already (e.g. a previous run created the new dir before
        // this one found a leftover old one) — nothing should be hidden.
        std::fs::create_dir_all(legacy_snapshot_parent_dir(&data_dir).join("1700000000_old"))
            .unwrap();
        std::fs::create_dir_all(snapshot_parent_dir(&data_dir).join("1700000100_new")).unwrap();

        let found = list_snapshots(&data_dir);
        let ids: Vec<&str> = found.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, ["1700000100_new", "1700000000_old"], "{ids:?}");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_clonefile_on_temp_dir() {
        let dir = std::env::temp_dir().join(format!("test_src_{}", std::process::id()));
        let dst = std::env::temp_dir().join(format!("test_dst_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&dst);

        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("test.txt"), "hello database").unwrap();

        let res = clonefile(&dir, &dst);
        if is_apfs(&dir) {
            assert!(res.is_ok(), "clonefile should succeed on APFS");
            assert!(dst.join("test.txt").exists());
        }

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&dst);
    }

    #[test]
    fn restore_errors_instead_of_deleting_data_when_snapshot_is_missing() {
        // No stop/start here any more — restore_snapshot only touches the
        // filesystem. A missing snapshot must fail before anything is moved.
        let dir = std::env::temp_dir().join(format!("test_restore_missing_{}", std::process::id()));
        let data_dir = dir.join("data");
        std::fs::create_dir_all(&data_dir).unwrap();
        std::fs::write(data_dir.join("live.db"), "still here").unwrap();

        let missing_snapshot = dir.join("no-such-snapshot");
        let res = restore_snapshot(&data_dir, &missing_snapshot);

        assert!(res.is_err(), "restoring from a missing snapshot must fail");
        assert!(
            data_dir.join("live.db").exists(),
            "the live data directory must be untouched when the snapshot does not exist"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn restore_does_not_lose_data_when_moving_it_aside_fails() {
        // Deny write on the parent dir so `fs::rename(data_dir, backup_path)`
        // fails (removing an entry needs write permission on its parent).
        // Previously this failure was ignored (`let _ = fs::rename(...)`) and
        // the clone proceeded into the still-live data_dir (AUDIT-2026-10-24
        // BUG-01). It must now abort before anything is cloned.
        use std::os::unix::fs::PermissionsExt;

        let dir =
            std::env::temp_dir().join(format!("test_restore_norename_{}", std::process::id()));
        let data_dir = dir.join("data");
        std::fs::create_dir_all(&data_dir).unwrap();
        std::fs::write(data_dir.join("live.db"), "irreplaceable").unwrap();
        let snapshot = dir.join("snapshot");
        std::fs::create_dir_all(&snapshot).unwrap();
        std::fs::write(snapshot.join("live.db"), "from snapshot").unwrap();

        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o555)).unwrap();
        let res = restore_snapshot(&data_dir, &snapshot);
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755)).unwrap();

        assert!(res.is_err(), "a failed rename must abort the restore");
        assert_eq!(
            std::fs::read_to_string(data_dir.join("live.db")).unwrap(),
            "irreplaceable",
            "the live data directory must be untouched when it could not be moved aside"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}
