use super::{blocking, confirm_action};
use crate::core::validate::{validate_alphanumeric_slug, ComposeProject};
use crate::error::AppResult;
use crate::remote::docker::{ComposeAction, DockerAction};
use crate::remote::parse::docker::Container;
use crate::services::local_docker::{self, DockerRuntimeStatus};
use tauri::AppHandle;

#[tauri::command]
pub async fn docker_runtime_status(_app: AppHandle) -> AppResult<DockerRuntimeStatus> {
    blocking(|| Ok(local_docker::probe_runtime())).await
}

#[tauri::command]
pub async fn docker_list_containers(_app: AppHandle) -> AppResult<Vec<Container>> {
    blocking(local_docker::list_containers).await
}

#[tauri::command]
pub async fn docker_container_action(
    app: AppHandle,
    name: String,
    action: DockerAction,
) -> AppResult<()> {
    validate_alphanumeric_slug(&name, "container name")?;
    let action_label = match action {
        DockerAction::Start => "Start",
        DockerAction::Stop => "Stop",
        DockerAction::Restart => "Restart",
        DockerAction::Remove => "Remove",
    };
    let is_destructive = matches!(action, DockerAction::Remove);
    confirm_action(
        &app,
        &format!("{action_label} container '{name}'?"),
        &format!("Execute docker {action_label} on local container '{name}'."),
        action_label,
        is_destructive,
    )?;
    blocking(move || local_docker::container_action(&name, action)).await
}

#[tauri::command]
pub async fn docker_compose_action(
    app: AppHandle,
    project: String,
    action: ComposeAction,
) -> AppResult<()> {
    let valid_proj = ComposeProject::try_from(project.as_str())?;
    let action_label = match action {
        ComposeAction::Start => "Start",
        ComposeAction::Stop => "Stop",
        ComposeAction::Restart => "Restart",
    };
    confirm_action(
        &app,
        &format!("{action_label} Compose stack '{}'?", valid_proj.as_str()),
        &format!(
            "Execute docker compose {action_label} on project '{}'.",
            valid_proj.as_str()
        ),
        action_label,
        false,
    )?;
    let p_str = valid_proj.as_str().to_string();
    blocking(move || local_docker::compose_action(&p_str, action)).await
}
