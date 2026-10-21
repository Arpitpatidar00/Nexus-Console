// Tauri IPC commands for Secrets Scanner (P11.3).

use crate::error::{AppError, AppResult};
use crate::services::projects::ProjectsState;
use crate::services::secrets::{self, SecretFinding, SecretsScanResult};
use std::collections::HashSet;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn blocking<F, T>(f: F) -> tauri::async_runtime::JoinHandle<T>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
}

#[tauri::command]
pub async fn secrets_scan_projects(
    app: AppHandle,
    paths: Option<Vec<String>>,
) -> AppResult<SecretsScanResult> {
    crate::core::consent::require_consent(crate::core::consent::DataSource::ProjectEnv)?;
    let target_paths: Vec<PathBuf> = if let Some(p) = paths {
        p.into_iter().map(PathBuf::from).collect()
    } else {
        let mut set = HashSet::new();
        if let Some(state) = app.try_state::<ProjectsState>() {
            if let Ok(store) = state.store.lock() {
                for w in &store.workspaces {
                    if !w.project_path.is_empty() {
                        set.insert(PathBuf::from(&w.project_path));
                    }
                }
                for c in &store.commands {
                    if !c.project_path.is_empty() {
                        set.insert(PathBuf::from(&c.project_path));
                    }
                }
            }
        }
        if set.is_empty() {
            let default_roots = vec![
                "~/Desktop".to_string(),
                "~/Developer".to_string(),
                "~/Projects".to_string(),
            ];
            for dp in crate::services::projects::discovery::discover_projects(&default_roots) {
                set.insert(PathBuf::from(dp.path));
            }
        }
        set.into_iter().collect()
    };

    blocking(move || secrets::scan_projects(&target_paths))
        .await
        .map_err(|e| AppError::Shell(format!("scan projects secrets task: {e}")))?
}

#[tauri::command]
pub async fn secrets_scan_history(_app: AppHandle) -> AppResult<Vec<SecretFinding>> {
    // A-06: Unified consent check before reading shell history
    crate::core::consent::require_consent(crate::core::consent::DataSource::ShellHistory)?;
    blocking(secrets::scan_shell_history)
        .await
        .map_err(|e| AppError::Shell(format!("scan shell history secrets task: {e}")))?
}
