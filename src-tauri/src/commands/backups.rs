// Tauri IPC commands for Backups Engine (P12.2).

use crate::core::error::{AppError, AppResult};
use crate::core::mutation::{BlastRadius, MutKind, MutationSpec};
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
    let spec = MutationSpec::new(
        "Create Database Backup?",
        format!(
            "Create {} database backup of “{}”?",
            config.engine, config.database
        ),
        "Create Backup",
    )
    .kind(MutKind::Create)
    .blast_radius(if config.source == "remote" {
        BlastRadius::RemoteNonProd
    } else {
        BlastRadius::LocalIsolated
    })
    .target(&config.database);

    let guard = crate::core::mutation::mutation(&app, spec)?;

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(format!("data dir: {e}")))?;

    let res = blocking(move || backups::create_database_backup(&dir, config))
        .await
        .map_err(|e| AppError::Shell(format!("create backup task: {e}")))?;

    match res {
        Ok(record) => {
            guard.success(format!("created dump at {}", record.target_file));
            Ok(record)
        }
        Err(e) => {
            guard.failure(e.to_string());
            Err(e)
        }
    }
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
    let spec = MutationSpec::new(
        "Delete Backup Archive?",
        format!("Delete backup archive {id} from disk?"),
        "Delete Archive",
    )
    .kind(MutKind::Delete)
    .blast_radius(BlastRadius::LocalIsolated)
    .target(&id)
    .destructive(true);

    let guard = crate::core::mutation::mutation(&app, spec)?;

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(format!("data dir: {e}")))?;

    let backup_id = id.clone();
    let res: AppResult<Vec<BackupRecord>> = blocking(move || {
        let mut index = BackupIndex::load(&dir);
        if let Some(record) = index.remove(&backup_id) {
            let _ = std::fs::remove_file(Path::new(&record.target_file));
            index.save(&dir)?;
        }
        Ok(index.backups)
    })
    .await
    .map_err(|e| AppError::Shell(format!("delete backup task: {e}")))?;

    match res {
        Ok(backups) => {
            guard.success(format!("deleted backup archive {id}"));
            Ok(backups)
        }
        Err(e) => {
            guard.failure(e.to_string());
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn backup_env_files(app: AppHandle, project_path: String) -> AppResult<BackupRecord> {
    let spec = MutationSpec::new(
        "Archive Project .env Files?",
        format!("Create compressed archive of .env files from {project_path}?"),
        "Archive .env",
    )
    .kind(MutKind::Create)
    .blast_radius(BlastRadius::LocalIsolated)
    .target(&project_path);

    let guard = crate::core::mutation::mutation(&app, spec)?;

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(format!("data dir: {e}")))?;

    let p = PathBuf::from(project_path);
    let res = blocking(move || backups::backup_project_env(&dir, &p))
        .await
        .map_err(|e| AppError::Shell(format!("backup env task: {e}")))?;

    match res {
        Ok(record) => {
            guard.success(format!("archived .env files to {}", record.target_file));
            Ok(record)
        }
        Err(e) => {
            guard.failure(e.to_string());
            Err(e)
        }
    }
}
