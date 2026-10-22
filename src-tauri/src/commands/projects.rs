use super::blocking;
use crate::core::exec::{self, ExecOpts};
use crate::core::mutation::{mutation, mutation_unattended, BlastRadius, MutationSpec};
use crate::error::{AppError, AppResult};
use crate::services::projects::discovery::{self, DiscoveredProject};
use crate::services::projects::git;
use crate::services::projects::github::{self, GitHubStatus};
use crate::services::projects::store::{
    new_command_id, new_workspace_id, ActiveWorkspaceState, SavedCommand, WorkspaceConfig,
    WorkspaceStepResult,
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
    app: AppHandle,
    path: String,
    branches: Vec<String>,
) -> AppResult<Vec<String>> {
    // `git branch -d` is irreversible from the UI — it was one click on
    // "Prune" with no confirmation. Name the branches in a native sheet.
    blocking(move || {
        let shown: Vec<&str> = branches.iter().take(12).map(String::as_str).collect();
        let more = branches.len().saturating_sub(shown.len());
        let list = format!(
            "{}{}",
            shown.join("\n"),
            if more > 0 { format!("\n…and {more} more") } else { String::new() }
        );
        let guard = mutation(
            &app,
            MutationSpec::new(
                format!("Delete {} merged branch(es)?", branches.len()),
                format!("These local branches are already merged and will be deleted in {path}:\n\n{list}"),
                "Delete branches",
            )
            .blast_radius(BlastRadius::LocalIsolated)
            .target(&path)
            .destructive(true),
        )?;
        let deleted = git::delete_merged_branches(Path::new(&path), &branches)?;
        guard.success(format!("deleted {} branch(es)", deleted.len()));
        Ok(deleted)
    })
    .await
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
    blocking(move || {
        let state = app.state::<ProjectsState>();
        let name = state
            .store
            .lock()
            .map_err(|_| AppError::Io("projects store poisoned".into()))?
            .workspaces
            .iter()
            .find(|x| x.id == id)
            .map(|x| x.name.clone())
            .ok_or_else(|| AppError::NotFound(format!("workspace {id}")))?;
        let guard = mutation(
            &app,
            MutationSpec::new(
                format!("Delete “{name}”?"),
                "This removes it from Stackroost. Nothing in your project folder is touched.",
                "Delete workspace",
            )
            .blast_radius(BlastRadius::LocalIsolated)
            .target(&name)
            .destructive(true),
        )?;
        let mut store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("projects store poisoned".into()))?;
        store.workspaces.retain(|x| x.id != id);
        let dir = state.path.parent().unwrap_or(&state.path);
        store.save(dir)?;
        guard.success("removed");
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn projects_start_workspace(
    app: AppHandle,
    id: String,
) -> AppResult<Vec<WorkspaceStepResult>> {
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

        let mut step_results = Vec::new();
        let mut started_brew = Vec::new();
        let mut started_compose = Vec::new();
        let mut started_tunnels = Vec::new();

        // 1. Homebrew Services via brew_bin + BrewLock + cache invalidate
        if !ws.brew_services.is_empty() {
            let brew_bin = app
                .try_state::<crate::context::AppContext>()
                .and_then(|c| c.brew_bin.clone())
                .unwrap_or_else(|| "brew".to_string());

            let brew_lock_state = app.state::<crate::brew::BrewLock>();
            let lock = brew_lock_state.0.lock();
            let opts = ExecOpts::default().with_timeout(Duration::from_secs(15));

            // Check pre-start status of brew services
            let list_out = exec::run(&brew_bin, &["services", "list", "--json"], opts.clone());
            let running_services: std::collections::HashSet<String> = if let Ok(o) = list_out {
                serde_json::from_slice::<Vec<serde_json::Value>>(&o.stdout)
                    .unwrap_or_default()
                    .into_iter()
                    .filter_map(|v| {
                        let name = v["name"].as_str()?.to_string();
                        let status = v["status"].as_str()?.to_string();
                        if status == "started" || status == "running" {
                            Some(name)
                        } else {
                            None
                        }
                    })
                    .collect()
            } else {
                std::collections::HashSet::new()
            };

            for svc in &ws.brew_services {
                if running_services.contains(svc) {
                    step_results.push(WorkspaceStepResult {
                        step: "brew".into(),
                        target: svc.clone(),
                        status: "already_running".into(),
                        message: Some("Service was already running".into()),
                    });
                } else {
                    let out = exec::run(&brew_bin, &["services", "start", svc], opts.clone());
                    match out {
                        Ok(o) if o.status.success() => {
                            started_brew.push(svc.clone());
                            step_results.push(WorkspaceStepResult {
                                step: "brew".into(),
                                target: svc.clone(),
                                status: "started".into(),
                                message: None,
                            });
                        }
                        Ok(o) => {
                            let err = String::from_utf8_lossy(&o.stderr).to_string();
                            step_results.push(WorkspaceStepResult {
                                step: "brew".into(),
                                target: svc.clone(),
                                status: "failed".into(),
                                message: Some(err),
                            });
                        }
                        Err(e) => {
                            step_results.push(WorkspaceStepResult {
                                step: "brew".into(),
                                target: svc.clone(),
                                status: "failed".into(),
                                message: Some(e.to_string()),
                            });
                        }
                    }
                }
            }
            drop(lock);

            if let Some(cache) = app.try_state::<crate::commands::services::ServicesCache>() {
                cache.invalidate();
            }
        }

        // 2. Docker Compose
        if !ws.compose_projects.is_empty() {
            let opts = ExecOpts::default().with_timeout(Duration::from_secs(15));
            for comp in &ws.compose_projects {
                // Check pre-start status
                let ps_out = exec::run(
                    "docker",
                    &["compose", "-p", comp, "ps", "--format", "json"],
                    opts.clone(),
                );
                let is_running = ps_out.is_ok_and(|o| {
                    let text = String::from_utf8_lossy(&o.stdout);
                    text.contains("\"running\"") || text.contains("\"healthy\"")
                });

                if is_running {
                    step_results.push(WorkspaceStepResult {
                        step: "compose".into(),
                        target: comp.clone(),
                        status: "already_running".into(),
                        message: Some("Project containers already active".into()),
                    });
                } else {
                    let out = exec::run("docker", &["compose", "-p", comp, "start"], opts.clone());
                    match out {
                        Ok(o) if o.status.success() => {
                            started_compose.push(comp.clone());
                            step_results.push(WorkspaceStepResult {
                                step: "compose".into(),
                                target: comp.clone(),
                                status: "started".into(),
                                message: None,
                            });
                        }
                        Ok(o) => {
                            let err = String::from_utf8_lossy(&o.stderr).to_string();
                            step_results.push(WorkspaceStepResult {
                                step: "compose".into(),
                                target: comp.clone(),
                                status: "failed".into(),
                                message: Some(err),
                            });
                        }
                        Err(e) => {
                            step_results.push(WorkspaceStepResult {
                                step: "compose".into(),
                                target: comp.clone(),
                                status: "failed".into(),
                                message: Some(e.to_string()),
                            });
                        }
                    }
                }
            }
        }

        // 3. Tunnels
        if let Some(remote_state) = app.try_state::<crate::services::remote::RemoteState>() {
            for tun_id in &ws.tunnels {
                let is_open = remote_state
                    .tunnels
                    .statuses(&remote_state)
                    .map(|v| {
                        v.iter().any(|s| {
                            s.config.id == *tun_id
                                && s.state == crate::services::remote::tunnel::TunnelState::Open
                        })
                    })
                    .unwrap_or(false);

                if is_open {
                    step_results.push(WorkspaceStepResult {
                        step: "tunnel".into(),
                        target: tun_id.clone(),
                        status: "already_running".into(),
                        message: Some("Tunnel already open".into()),
                    });
                } else {
                    match remote_state.tunnels.open(&remote_state, tun_id) {
                        Ok(_) => {
                            started_tunnels.push(tun_id.clone());
                            step_results.push(WorkspaceStepResult {
                                step: "tunnel".into(),
                                target: tun_id.clone(),
                                status: "started".into(),
                                message: None,
                            });
                        }
                        Err(e) => {
                            step_results.push(WorkspaceStepResult {
                                step: "tunnel".into(),
                                target: tun_id.clone(),
                                status: "failed".into(),
                                message: Some(e.to_string()),
                            });
                        }
                    }
                }
            }
        }

        // 4. Saved Commands (visible PTYs via event emit)
        use tauri::Emitter;
        for cmd in &ws.saved_commands {
            let _ = app.emit(
                "workspace_open_terminal",
                serde_json::json!({
                    "id": cmd.id,
                    "name": cmd.name,
                    "command": cmd.command,
                    "projectPath": ws.project_path,
                }),
            );
            step_results.push(WorkspaceStepResult {
                step: "command".into(),
                target: cmd.name.clone(),
                status: "started".into(),
                message: Some(format!("Launched terminal running: {}", cmd.command)),
            });
        }

        // 5. Open in VS Code if requested
        if ws.open_vscode {
            let opts = ExecOpts::default().with_timeout(Duration::from_secs(5));
            let _ = exec::run("code", &[&ws.project_path], opts);
            step_results.push(WorkspaceStepResult {
                step: "vscode".into(),
                target: ws.project_path.clone(),
                status: "started".into(),
                message: Some("Opened workspace in VS Code".into()),
            });
        }

        // Record ownership state: only what we started
        store.active_workspaces.retain(|a| a.workspace_id != id);
        store.active_workspaces.push(ActiveWorkspaceState {
            workspace_id: id,
            started_brew_services: started_brew,
            started_compose_projects: started_compose,
            started_tunnels,
        });

        let dir = state.path.parent().unwrap_or(&state.path);
        store.save(dir)?;
        Ok(step_results)
    })
    .await
}

#[tauri::command]
pub async fn projects_stop_workspace(
    app: AppHandle,
    id: String,
) -> AppResult<Vec<WorkspaceStepResult>> {
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

        let mut step_results = Vec::new();

        if let Some(active) = store
            .active_workspaces
            .iter()
            .find(|a| a.workspace_id == id)
            .cloned()
        {
            // Stop ONLY what this workspace started!
            let opts = ExecOpts::default().with_timeout(Duration::from_secs(15));

            // Stop started Homebrew services via brew_bin + BrewLock + cache invalidate
            if !active.started_brew_services.is_empty() {
                let brew_bin = app
                    .try_state::<crate::context::AppContext>()
                    .and_then(|c| c.brew_bin.clone())
                    .unwrap_or_else(|| "brew".to_string());

                let brew_lock_state = app.state::<crate::brew::BrewLock>();
                let lock = brew_lock_state.0.lock();
                for svc in &active.started_brew_services {
                    let out = exec::run(&brew_bin, &["services", "stop", svc], opts.clone());
                    step_results.push(WorkspaceStepResult {
                        step: "brew".into(),
                        target: svc.clone(),
                        status: if out.is_ok() {
                            "stopped".into()
                        } else {
                            "failed".into()
                        },
                        message: None,
                    });
                }
                drop(lock);

                if let Some(cache) = app.try_state::<crate::commands::services::ServicesCache>() {
                    cache.invalidate();
                }
            }

            // Stop started Docker compose projects
            for comp in &active.started_compose_projects {
                let out = exec::run("docker", &["compose", "-p", comp, "stop"], opts.clone());
                step_results.push(WorkspaceStepResult {
                    step: "compose".into(),
                    target: comp.clone(),
                    status: if out.is_ok() {
                        "stopped".into()
                    } else {
                        "failed".into()
                    },
                    message: None,
                });
            }

            // Close started tunnels
            if let Some(remote_state) = app.try_state::<crate::services::remote::RemoteState>() {
                for tun_id in &active.started_tunnels {
                    let _ = remote_state.tunnels.close(&remote_state, tun_id);
                    step_results.push(WorkspaceStepResult {
                        step: "tunnel".into(),
                        target: tun_id.clone(),
                        status: "stopped".into(),
                        message: None,
                    });
                }
            }

            store.active_workspaces.retain(|a| a.workspace_id != id);
            let dir = state.path.parent().unwrap_or(&state.path);
            store.save(dir)?;
        }

        Ok(step_results)
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
    blocking(move || {
        let state = app.state::<ProjectsState>();
        let name = state
            .store
            .lock()
            .map_err(|_| AppError::Io("projects store poisoned".into()))?
            .commands
            .iter()
            .find(|x| x.id == id)
            .map(|x| x.name.clone())
            .ok_or_else(|| AppError::NotFound(format!("saved command {id}")))?;
        let guard = mutation(
            &app,
            MutationSpec::new(
                format!("Delete “{name}”?"),
                "This removes it from Stackroost. Nothing in your project folder is touched.",
                "Delete command",
            )
            .blast_radius(BlastRadius::LocalIsolated)
            .target(&name)
            .destructive(true),
        )?;
        let mut store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("projects store poisoned".into()))?;
        store.commands.retain(|x| x.id != id);
        let dir = state.path.parent().unwrap_or(&state.path);
        store.save(dir)?;
        guard.success("removed");
        Ok(())
    })
    .await
}
