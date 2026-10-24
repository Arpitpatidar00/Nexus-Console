// Tauri IPC commands for Mac Blueprint (P10.1).

use crate::context::AppContext;
use crate::error::{AppError, AppResult};
use crate::services::blueprint::{self, BlueprintDiffReport, BlueprintHost, NexusBlueprint};
use crate::services::projects::store::WorkspaceConfig;
use tauri::{AppHandle, Manager};

use super::blocking;

#[tauri::command]
pub async fn blueprint_export(app: AppHandle) -> AppResult<NexusBlueprint> {
    blocking(move || blueprint::export_blueprint(&app)).await
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
}

#[tauri::command]
pub async fn blueprint_apply_homebrew(app: AppHandle, brewfile: String) -> AppResult<()> {
    let _guard = crate::core::mutation::mutation(
        &app,
        crate::core::mutation::MutationSpec::new(
            "Install the blueprint's Homebrew packages?",
            "Runs `brew bundle install` on the blueprint's Brewfile. A Brewfile is Ruby and can run code on this Mac — only apply a blueprint you made or trust.",
            "Install packages",
        )
        .blast_radius(crate::core::mutation::BlastRadius::LocalSystem),
    )?;
    let ctx = app.state::<AppContext>();
    let brew_bin = ctx
        .brew_bin
        .as_deref()
        .unwrap_or("/opt/homebrew/bin/brew")
        .to_string();

    blocking(move || {
        let lock = app.state::<crate::brew::BrewLock>();
        let _g = lock
            .0
            .lock()
            .map_err(|_| AppError::Io("brew lock poisoned".into()))?;
        let res = blueprint::apply_homebrew_bundle(&brewfile, &brew_bin);
        app.state::<crate::commands::services::ServicesCache>()
            .invalidate();
        res
    })
    .await
}

#[tauri::command]
pub async fn blueprint_apply_hosts(app: AppHandle, hosts: Vec<BlueprintHost>) -> AppResult<usize> {
    let _guard = crate::core::mutation::mutation(
        &app,
        crate::core::mutation::MutationSpec::new(
            "Apply Blueprint Hosts",
            format!(
                "Import {} host definition{} from the blueprint.",
                hosts.len(),
                if hosts.len() == 1 { "" } else { "s" }
            ),
            "Import hosts",
        )
        .blast_radius(crate::core::mutation::BlastRadius::LocalIsolated),
    )?;
    blocking(move || blueprint::apply_blueprint_hosts(hosts, &app)).await
}

#[tauri::command]
pub async fn blueprint_apply_workspaces(
    app: AppHandle,
    workspaces: Vec<WorkspaceConfig>,
) -> AppResult<usize> {
    let _guard = crate::core::mutation::mutation(
        &app,
        crate::core::mutation::MutationSpec::new(
            "Apply Blueprint Workspaces",
            format!(
                "Import {} project workspace{} from the blueprint.",
                workspaces.len(),
                if workspaces.len() == 1 { "" } else { "s" }
            ),
            "Import workspaces",
        )
        .blast_radius(crate::core::mutation::BlastRadius::LocalIsolated),
    )?;
    blocking(move || blueprint::apply_blueprint_workspaces(workspaces, &app)).await
}

#[tauri::command]
pub async fn blueprint_apply_extensions(
    app: AppHandle,
    extensions: Vec<String>,
) -> AppResult<usize> {
    let _guard = crate::core::mutation::mutation(
        &app,
        crate::core::mutation::MutationSpec::new(
            "Apply Blueprint Extensions",
            format!("Install {} VSCode extension(s)", extensions.len()),
            "Install extensions",
        )
        .blast_radius(crate::core::mutation::BlastRadius::LocalSystem),
    )?;
    blocking(move || blueprint::apply_blueprint_extensions(extensions)).await
}
