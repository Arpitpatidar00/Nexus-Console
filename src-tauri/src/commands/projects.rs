use super::blocking;
use crate::core::exec::{self, ExecOpts};
use crate::core::mutation::{mutation_unattended, BlastRadius, MutationSpec};
use crate::error::{AppError, AppResult};
use crate::services::projects::discovery::{self, DiscoveredProject};
use crate::services::projects::git;
use crate::services::projects::github::{self, GitHubStatus};
use crate::services::projects::store::{
    new_command_id, new_workspace_id, ActiveWorkspaceState, SavedCommand, WorkspaceConfig,
};
use crate::services::projects::ProjectsState;
use std::path::Path;
use std::time::Duration;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn projects_discover(
    _app: AppHandle,
    roots: Vec<String>,
) -> AppResult<Vec<DiscoveredProject>> {
    blocking(move || Ok(discovery::discover_projects(&roots))).await
}

#[tauri::command]
pub async fn projects_git_fetch(_app: AppHandle, path: String) -> AppResult<()> {
    blocking(move || git::git_fetch(Path::new(&path))).await
}

#[tauri::command]
pub async fn projects_delete_merged_branches(
    _app: AppHandle,
    path: String,
    branches: Vec<String>,
) -> AppResult<Vec<String>> {
    let _guard = mutation_unattended(
        MutationSpec::new(
            "Delete merged branches",
            format!("Delete {} merged branch(es) in {}", branches.len(), path),
            "delete_merged_branches",
        )
        .blast_radius(BlastRadius::LocalIsolated)
        .target(&path)
        .destructive(true),
    );
    blocking(move || git::delete_merged_branches(Path::new(&path), &branches)).await
}

#[tauri::command]
pub async fn projects_get_github_status(_app: AppHandle, path: String) -> AppResult<GitHubStatus> {
    blocking(move || github::get_github_status(Path::new(&path))).await
}

#[tauri::command]
pub async fn projects_list_workspaces(app: AppHandle) -> AppResult<Vec<WorkspaceConfig>> {
    blocking(move || {
        let state = app.state::<ProjectsState>();
        let store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("projects store poisoned".into()))?;
        Ok(store.workspaces.clone())
    })
    .await
}

#[tauri::command]
pub async fn projects_save_workspace(
    app: AppHandle,
    mut config: WorkspaceConfig,
) -> AppResult<WorkspaceConfig> {
    let _guard = mutation_unattended(
        MutationSpec::new(
            "Save workspace",
            format!("Save workspace {}", config.name),
            "save_workspace",
        )
        .blast_radius(BlastRadius::LocalIsolated)
        .target(&config.name),
    );
    blocking(move || {
        let state = app.state::<ProjectsState>();
        let mut store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("projects store poisoned".into()))?;

        if config.id.is_empty() {
            config.id = new_workspace_id();
        }

        store.workspaces.retain(|w| w.id != config.id);
        store.workspaces.push(config.clone());

        let dir = state.path.parent().unwrap_or(&state.path);
        store.save(dir)?;
        Ok(config)
    })
    .await
}

#[tauri::command]
pub async fn projects_delete_workspace(app: AppHandle, id: String) -> AppResult<()> {
    let _guard = mutation_unattended(
        MutationSpec::new(
            "Delete workspace",
            format!("Delete workspace {id}"),
            "delete_workspace",
        )
        .blast_radius(BlastRadius::LocalIsolated)
        .target(&id)
        .destructive(true),
    );
    blocking(move || {
        let state = app.state::<ProjectsState>();
        let mut store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("projects store poisoned".into()))?;

        store.workspaces.retain(|w| w.id != id);

        let dir = state.path.parent().unwrap_or(&state.path);
        store.save(dir)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn projects_start_workspace(app: AppHandle, id: String) -> AppResult<()> {
    let _guard = mutation_unattended(
        MutationSpec::new(
            "Start workspace",
            format!("Start workspace {id}"),
            "start_workspace",
        )
        .blast_radius(BlastRadius::LocalIsolated)
        .target(&id),
    );
    blocking(move || {
        let state = app.state::<ProjectsState>();
        let mut store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("projects store poisoned".into()))?;

        let ws = store
            .workspaces
            .iter()
            .find(|w| w.id == id)
            .cloned()
            .ok_or_else(|| AppError::NotFound(format!("workspace {id}")))?;

        let mut started_brew = Vec::new();
        let mut started_compose = Vec::new();

        // Start Homebrew services
        let opts = ExecOpts::default().with_timeout(Duration::from_secs(15));
        for svc in &ws.brew_services {
            if exec::run("brew", &["services", "start", svc], opts.clone()).is_ok() {
                started_brew.push(svc.clone());
            }
        }

        // Start Compose projects
        for comp in &ws.compose_projects {
            if exec::run("docker", &["compose", "-p", comp, "start"], opts.clone()).is_ok() {
                started_compose.push(comp.clone());
            }
        }

        // Open in VS Code if requested
        if ws.open_vscode {
            let _ = exec::run("code", &[&ws.project_path], opts);
        }

        // Record ownership state
        store.active_workspaces.retain(|a| a.workspace_id != id);
        store.active_workspaces.push(ActiveWorkspaceState {
            workspace_id: id,
            started_brew_services: started_brew,
            started_compose_projects: started_compose,
            started_tunnels: vec![],
        });

        let dir = state.path.parent().unwrap_or(&state.path);
        store.save(dir)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn projects_stop_workspace(app: AppHandle, id: String) -> AppResult<()> {
    let _guard = mutation_unattended(
        MutationSpec::new(
            "Stop workspace",
            format!("Stop workspace {id}"),
            "stop_workspace",
        )
        .blast_radius(BlastRadius::LocalIsolated)
        .target(&id)
        .destructive(true),
    );
    blocking(move || {
        let state = app.state::<ProjectsState>();
        let mut store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("projects store poisoned".into()))?;

        if let Some(active) = store
            .active_workspaces
            .iter()
            .find(|a| a.workspace_id == id)
            .cloned()
        {
            let opts = ExecOpts::default().with_timeout(Duration::from_secs(15));
            // Stop ONLY what this workspace started
            for svc in &active.started_brew_services {
                let _ = exec::run("brew", &["services", "stop", svc], opts.clone());
            }

            for comp in &active.started_compose_projects {
                let _ = exec::run("docker", &["compose", "-p", comp, "stop"], opts.clone());
            }

            store.active_workspaces.retain(|a| a.workspace_id != id);
            let dir = state.path.parent().unwrap_or(&state.path);
            store.save(dir)?;
        }

        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn projects_list_saved_commands(
    app: AppHandle,
    project_path: String,
) -> AppResult<Vec<SavedCommand>> {
    blocking(move || {
        let state = app.state::<ProjectsState>();
        let store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("projects store poisoned".into()))?;

        Ok(store
            .commands
            .iter()
            .filter(|c| c.project_path == project_path)
            .cloned()
            .collect())
    })
    .await
}

#[tauri::command]
pub async fn projects_save_command(
    app: AppHandle,
    mut command: SavedCommand,
) -> AppResult<SavedCommand> {
    let _guard = mutation_unattended(
        MutationSpec::new(
            "Save command",
            format!("Save command {}", command.name),
            "save_command",
        )
        .blast_radius(BlastRadius::LocalIsolated)
        .target(&command.name),
    );
    blocking(move || {
        let state = app.state::<ProjectsState>();
        let mut store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("projects store poisoned".into()))?;

        if command.id.is_empty() {
            command.id = new_command_id();
        }

        store.commands.retain(|c| c.id != command.id);
        store.commands.push(command.clone());

        let dir = state.path.parent().unwrap_or(&state.path);
        store.save(dir)?;
        Ok(command)
    })
    .await
}

#[tauri::command]
pub async fn projects_delete_command(app: AppHandle, id: String) -> AppResult<()> {
    let _guard = mutation_unattended(
        MutationSpec::new(
            "Delete command",
            format!("Delete command {id}"),
            "delete_command",
        )
        .blast_radius(BlastRadius::LocalIsolated)
        .target(&id)
        .destructive(true),
    );
    blocking(move || {
        let state = app.state::<ProjectsState>();
        let mut store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("projects store poisoned".into()))?;

        store.commands.retain(|c| c.id != id);

        let dir = state.path.parent().unwrap_or(&state.path);
        store.save(dir)?;
        Ok(())
    })
    .await
}
