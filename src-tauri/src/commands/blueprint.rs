// Tauri IPC commands for Mac Blueprint (P10.1).

use crate::context::AppContext;
use crate::error::{AppError, AppResult};
use crate::services::blueprint::{self, BlueprintDiffReport, BlueprintHost, NexusBlueprint};
use crate::services::projects::store::WorkspaceConfig;
use tauri::{AppHandle, Manager};

fn blocking<F, T>(f: F) -> tauri::async_runtime::JoinHandle<T>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
}

#[tauri::command]
pub async fn blueprint_export(app: AppHandle) -> AppResult<NexusBlueprint> {
    blocking(move || blueprint::export_blueprint(&app))
        .await
        .map_err(|e| AppError::Shell(format!("blueprint task: {e}")))?
}

#[tauri::command]
pub async fn blueprint_analyze_import(
    app: AppHandle,
    blueprint_json: String,
) -> AppResult<BlueprintDiffReport> {
    blocking(move || {
        let bp: NexusBlueprint = serde_json::from_str(&blueprint_json)
            .map_err(|e| AppError::InvalidName(format!("malformed blueprint JSON: {e}")))?;
        blueprint::analyze_blueprint(&bp, &app)
    })
    .await
    .map_err(|e| AppError::Shell(format!("blueprint diff task: {e}")))?
}

#[tauri::command]
pub async fn blueprint_apply_homebrew(app: AppHandle, brewfile: String) -> AppResult<()> {
    let ctx = app.state::<AppContext>();
    let brew_bin = ctx
        .brew_bin
        .as_deref()
        .unwrap_or("/opt/homebrew/bin/brew")
        .to_string();

    blocking(move || blueprint::apply_homebrew_bundle(&brewfile, &brew_bin))
        .await
        .map_err(|e| AppError::Shell(format!("brew bundle task: {e}")))?
}

#[tauri::command]
pub async fn blueprint_apply_hosts(app: AppHandle, hosts: Vec<BlueprintHost>) -> AppResult<usize> {
    blocking(move || blueprint::apply_blueprint_hosts(hosts, &app))
        .await
        .map_err(|e| AppError::Shell(format!("hosts task: {e}")))?
}

#[tauri::command]
pub async fn blueprint_apply_workspaces(
    app: AppHandle,
    workspaces: Vec<WorkspaceConfig>,
) -> AppResult<usize> {
    blocking(move || blueprint::apply_blueprint_workspaces(workspaces, &app))
        .await
        .map_err(|e| AppError::Shell(format!("workspaces task: {e}")))?
}

#[tauri::command]
pub async fn blueprint_apply_extensions(extensions: Vec<String>) -> AppResult<usize> {
    blocking(move || blueprint::apply_blueprint_extensions(extensions))
        .await
        .map_err(|e| AppError::Shell(format!("extensions task: {e}")))?
}
