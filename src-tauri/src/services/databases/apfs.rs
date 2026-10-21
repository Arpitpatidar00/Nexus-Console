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

pub fn list_snapshots(service_data_dir: &Path) -> Vec<DbSnapshot> {
    if validate_local_path(service_data_dir).is_err() {
        return Vec::new();
    }
    let snap_dir = snapshot_parent_dir(service_data_dir);
    let mut list = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&snap_dir) {
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

    list.sort_by_key(|a| std::cmp::Reverse(a.created_at));
    list
}

pub fn snapshot_parent_dir(data_dir: &Path) -> PathBuf {
    let dir_name = data_dir.file_name().unwrap_or_default().to_string_lossy();
    let parent = data_dir.parent().unwrap_or(data_dir);
    parent.join(format!("{dir_name}-nexus-snapshots"))
}

pub fn create_snapshot(
    service_name: Option<&str>,
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

    // Stop service if provided
    if let Some(svc) = service_name {
        validate_service_name(svc)?;
        let opts =
            crate::core::exec::ExecOpts::default().with_timeout(std::time::Duration::from_secs(15));
        let _ = crate::core::exec::run("brew", &["services", "stop", svc], opts);
    }

    // APFS CoW clone
    let clone_res = clonefile(data_dir, &snap_path);

    // Always restart service if stopped
    if let Some(svc) = service_name {
        let opts =
            crate::core::exec::ExecOpts::default().with_timeout(std::time::Duration::from_secs(15));
        let _ = crate::core::exec::run("brew", &["services", "start", svc], opts);
    }

    clone_res?;

    let size_bytes = measure_dir_size_bytes(&snap_path);

    Ok(DbSnapshot {
        id: snap_name,
        service: service_name.unwrap_or("database").to_string(),
        label: label.to_string(),
        path: snap_path.to_string_lossy().to_string(),
        created_at: now,
        size_bytes,
    })
}

pub fn restore_snapshot(
    service_name: Option<&str>,
    data_dir: &Path,
    snapshot_path: &Path,
) -> AppResult<()> {
    validate_local_path(data_dir)?;
    validate_local_path(snapshot_path)?;
    if !snapshot_path.exists() {
        return Err(AppError::NotFound(format!(
            "snapshot {}",
            snapshot_path.display()
        )));
    }

    // Stop service
    if let Some(svc) = service_name {
        validate_service_name(svc)?;
        let opts =
            crate::core::exec::ExecOpts::default().with_timeout(std::time::Duration::from_secs(15));
        let _ = crate::core::exec::run("brew", &["services", "stop", svc], opts);
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // Backup current data dir to <data_dir>.before-restore-<now>
    let backup_path = data_dir.with_extension(format!("before-restore-{now}"));
    if data_dir.exists() {
        let _ = std::fs::rename(data_dir, &backup_path);
    }

    // Clone snapshot back to data_dir
    let clone_res = clonefile(snapshot_path, data_dir);

    // Restart service
    if let Some(svc) = service_name {
        let opts =
            crate::core::exec::ExecOpts::default().with_timeout(std::time::Duration::from_secs(15));
        let _ = crate::core::exec::run("brew", &["services", "start", svc], opts);
    }

    clone_res
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
