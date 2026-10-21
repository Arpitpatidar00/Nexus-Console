// App updates via tauri-plugin-updater (PLAN G.2, replaces the B.4 curl checker).
// Checks only when the user clicks; installing asks first, verifies the
// minisign signature against the pubkey in tauri.conf.json, then relaunches.

use crate::core::error::{AppError, AppResult};
use crate::core::mutation::{mutation, BlastRadius, MutationSpec};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

/// Canonical GitHub repository source for Stackroost releases
pub const GITHUB_REPO: &str = "Arpitpatidar00/Stackroost";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_url: String,
    pub release_notes: Option<String>,
}

fn release_url(version: &str) -> String {
    format!("https://github.com/{GITHUB_REPO}/releases/tag/v{version}")
}

fn updater_err(e: tauri_plugin_updater::Error) -> AppError {
    AppError::Io(format!("update check failed: {e}"))
}

#[tauri::command]
pub async fn app_check_update(app: AppHandle) -> AppResult<UpdateCheckResult> {
    crate::core::net::check_outbound_allowed("github.com")?;
    let current = app.package_info().version.to_string();
    let update = app
        .updater()
        .map_err(updater_err)?
        .check()
        .await
        .map_err(updater_err)?;
    Ok(match update {
        Some(u) => UpdateCheckResult {
            has_update: true,
            current_version: current,
            release_url: release_url(&u.version),
            latest_version: u.version,
            release_notes: u.body,
        },
        None => UpdateCheckResult {
            has_update: false,
            release_url: release_url(&current),
            latest_version: current.clone(),
            current_version: current,
            release_notes: None,
        },
    })
}

/// Download, verify and install the latest release, then relaunch.
#[tauri::command]
pub async fn app_install_update(app: AppHandle) -> AppResult<()> {
    crate::core::net::check_outbound_allowed("github.com")?;
    let update = app
        .updater()
        .map_err(updater_err)?
        .check()
        .await
        .map_err(updater_err)?
        .ok_or_else(|| AppError::NotFound("Already on the latest version.".into()))?;

    let spec = MutationSpec::new(
        "Install update",
        format!(
            "Install Stackroost {} and relaunch? Running services keep running.",
            update.version
        ),
        "Install & relaunch",
    )
    .blast_radius(BlastRadius::LocalSystem)
    .target(format!("Stackroost {}", update.version));
    let guard = mutation(&app, spec)?;

    match update.download_and_install(|_, _| {}, || {}).await {
        Ok(()) => {
            guard.success(format!("installed {}", update.version));
            drop(guard);
            app.restart();
        }
        Err(e) => {
            guard.failure(e.to_string());
            Err(AppError::Io(format!("update install failed: {e}")))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn release_url_points_at_the_tag() {
        assert_eq!(
            release_url("0.2.0"),
            "https://github.com/Arpitpatidar00/Stackroost/releases/tag/v0.2.0"
        );
    }
}
