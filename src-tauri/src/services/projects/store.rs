use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedCommand {
    pub id: String,
    pub project_path: String,
    pub name: String,
    pub command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceConfig {
    pub id: String,
    pub name: String,
    pub project_path: String,
    pub brew_services: Vec<String>,
    pub compose_projects: Vec<String>,
    pub tunnels: Vec<String>,
    pub open_vscode: bool,
    pub saved_commands: Vec<SavedCommand>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveWorkspaceState {
    pub workspace_id: String,
    pub started_brew_services: Vec<String>,
    pub started_compose_projects: Vec<String>,
    pub started_tunnels: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceStepResult {
    pub step: String,
    pub target: String,
    pub status: String,
    pub message: Option<String>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectsStore {
    pub workspaces: Vec<WorkspaceConfig>,
    pub commands: Vec<SavedCommand>,
    pub active_workspaces: Vec<ActiveWorkspaceState>,
}

pub fn new_workspace_id() -> String {
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("ws_{t}")
}

pub fn new_command_id() -> String {
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("cmd_{t}")
}

impl ProjectsStore {
    pub fn load(dir: &Path) -> Self {
        crate::core::store::load_store(dir.join("projects.json"))
    }

    pub fn save(&self, dir: &Path) -> AppResult<()> {
        crate::core::store::save_store(dir.join("projects.json"), self, false)
    }
}
