// Application update check command (P10.3).
// Daily launch check (opt-in); never updates automatically without explicit user click.

use crate::error::AppResult;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_url: String,
    pub release_notes: Option<String>,
}

#[tauri::command]
pub async fn app_check_update() -> AppResult<UpdateCheckResult> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();

    let client = std::process::Command::new("curl")
        .args([
            "-s",
            "--max-time",
            "5",
            "-H",
            "User-Agent: Stackroost-Console",
            "https://api.github.com/repos/Arpitpatidar00/Chat-App-System/releases/latest",
        ])
        .output();

    if let Ok(out) = client {
        if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&out.stdout) {
            if let Some(tag) = json.get("tag_name").and_then(|v| v.as_str()) {
                let latest_clean = tag.trim_start_matches('v');
                let has_update = latest_clean != current_version && !latest_clean.is_empty();
                let release_url = json
                    .get("html_url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("https://github.com/Arpitpatidar00/Chat-App-System/releases")
                    .to_string();
                let release_notes = json
                    .get("body")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                return Ok(UpdateCheckResult {
                    has_update,
                    current_version,
                    latest_version: latest_clean.to_string(),
                    release_url,
                    release_notes,
                });
            }
        }
    }

    Ok(UpdateCheckResult {
        has_update: false,
        current_version: current_version.clone(),
        latest_version: current_version,
        release_url: "https://github.com/Arpitpatidar00/Chat-App-System/releases".into(),
        release_notes: None,
    })
}
