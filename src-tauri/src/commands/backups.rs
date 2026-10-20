// Tauri IPC commands for Backups Engine (P12.2).

use crate::error::{AppError, AppResult};
use crate::services::backups::{self, BackupConfig, BackupIndex, BackupRecord};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

fn blocking<F, T>(f: F) -> tauri::async_runtime::JoinHandle<T>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
}

#[tauri::command]
pub async fn backup_create_db(app: AppHandle, config: BackupConfig) -> AppResult<BackupRecord> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(format!("data dir: {e}")))?;
    blocking(move || backups::create_database_backup(&dir, config))
        .await
        .map_err(|e| AppError::Shell(format!("create backup task: {e}")))?
}

#[tauri::command]
pub async fn backup_list_history(app: AppHandle) -> AppResult<Vec<BackupRecord>> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(format!("data dir: {e}")))?;
    blocking(move || {
        let index = BackupIndex::load(&dir);
        Ok(index.backups)
    })
    .await
    .map_err(|e| AppError::Shell(format!("list backups task: {e}")))?
}

#[tauri::command]
pub async fn backup_delete(app: AppHandle, id: String) -> AppResult<Vec<BackupRecord>> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(format!("data dir: {e}")))?;
    blocking(move || {
        let mut index = BackupIndex::load(&dir);
        if let Some(record) = index.remove(&id) {
            let _ = std::fs::remove_file(Path::new(&record.target_file));
            index.save(&dir)?;
        }
        Ok(index.backups)
    })
    .await
    .map_err(|e| AppError::Shell(format!("delete backup task: {e}")))?
}

#[tauri::command]
pub async fn backup_env_files(app: AppHandle, project_path: String) -> AppResult<BackupRecord> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(format!("data dir: {e}")))?;
    let p = PathBuf::from(project_path);
    blocking(move || backups::backup_project_env(&dir, &p))
        .await
        .map_err(|e| AppError::Shell(format!("backup env task: {e}")))?
}
