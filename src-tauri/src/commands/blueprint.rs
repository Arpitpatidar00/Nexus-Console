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

use super::confirm_action;

#[tauri::command]
pub async fn blueprint_apply_homebrew(app: AppHandle, brewfile: String) -> AppResult<()> {
    confirm_action(
        &app,
        "Apply Homebrew bundle?",
        "This will install packages and casks defined in the blueprint Brewfile.",
        "Apply Bundle",
        false,
    )?;
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
    confirm_action(
        &app,
        &format!(
            "Apply {} Blueprint host{}?",
            hosts.len(),
            if hosts.len() == 1 { "" } else { "s" }
        ),
        "This will import host definitions from the blueprint.",
        "Apply Hosts",
        false,
    )?;
    blocking(move || blueprint::apply_blueprint_hosts(hosts, &app))
        .await
        .map_err(|e| AppError::Shell(format!("hosts task: {e}")))?
}

#[tauri::command]
pub async fn blueprint_apply_workspaces(
    app: AppHandle,
    workspaces: Vec<WorkspaceConfig>,
) -> AppResult<usize> {
    confirm_action(
        &app,
        &format!(
            "Apply {} Blueprint workspace{}?",
            workspaces.len(),
            if workspaces.len() == 1 { "" } else { "s" }
        ),
        "This will import project workspaces from the blueprint.",
        "Apply Workspaces",
        false,
    )?;
    blocking(move || blueprint::apply_blueprint_workspaces(workspaces, &app))
        .await
        .map_err(|e| AppError::Shell(format!("workspaces task: {e}")))?
}

#[tauri::command]
pub async fn blueprint_apply_extensions(extensions: Vec<String>) -> AppResult<usize> {
    let _guard = crate::core::mutation::mutation_unattended(
        crate::core::mutation::MutationSpec::new(
            "Apply Blueprint extensions",
            format!("Install {} VSCode extension(s)", extensions.len()),
            "blueprint_apply_extensions",
        )
        .blast_radius(crate::core::mutation::BlastRadius::LocalSystem),
    );
    blocking(move || blueprint::apply_blueprint_extensions(extensions))
        .await
        .map_err(|e| AppError::Shell(format!("extensions task: {e}")))?
}
