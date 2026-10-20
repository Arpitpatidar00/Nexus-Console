use super::blocking;
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
    _app: AppHandle,
    name: String,
    action: DockerAction,
) -> AppResult<()> {
    blocking(move || local_docker::container_action(&name, action)).await
}

#[tauri::command]
pub async fn docker_compose_action(
    _app: AppHandle,
    project: String,
    action: ComposeAction,
) -> AppResult<()> {
    blocking(move || local_docker::compose_action(&project, action)).await
}
