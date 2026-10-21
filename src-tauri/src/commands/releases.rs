use crate::error::AppResult;
use crate::services::releases::{self, ProjectReleaseConfig};

#[tauri::command]
pub async fn releases_detect_config(project_path: String) -> AppResult<ProjectReleaseConfig> {
    super::blocking(move || releases::detect_release_configs(&project_path)).await
}
