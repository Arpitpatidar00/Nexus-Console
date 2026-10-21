// Application update check command (P10.3 / T-12).
// Daily launch check (opt-in); never updates automatically without explicit user click.

use crate::error::AppResult;
use serde::{Deserialize, Serialize};

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

pub fn parse_release_json(
    json_bytes: &[u8],
    current_version: &str,
    repo: &str,
) -> Option<UpdateCheckResult> {
    let json: serde_json::Value = serde_json::from_slice(json_bytes).ok()?;
    let tag = json.get("tag_name").and_then(|v| v.as_str())?;
    let latest_clean = tag.trim_start_matches('v');
    let has_update = latest_clean != current_version && !latest_clean.is_empty();
    let default_url = format!("https://github.com/{repo}/releases");
    let release_url = json
        .get("html_url")
        .and_then(|v| v.as_str())
        .unwrap_or(&default_url)
        .to_string();
    let release_notes = json
        .get("body")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    Some(UpdateCheckResult {
        has_update,
        current_version: current_version.to_string(),
        latest_version: latest_clean.to_string(),
        release_url,
        release_notes,
    })
}

#[tauri::command]
pub async fn app_check_update() -> AppResult<UpdateCheckResult> {
    super::blocking(move || {
        let current_version = env!("CARGO_PKG_VERSION").to_string();
        let api_url = format!("https://api.github.com/repos/{GITHUB_REPO}/releases/latest");
        let fallback_url = format!("https://github.com/{GITHUB_REPO}/releases");

        let opts =
            crate::core::exec::ExecOpts::default().with_timeout(std::time::Duration::from_secs(6));
        let out = crate::core::exec::run(
            "curl",
            &[
                "-s",
                "--max-time",
                "5",
                "-H",
                "User-Agent: Stackroost-Console",
                &api_url,
            ],
            opts,
        );

        if let Ok(res) = out {
            if let Some(parsed) = parse_release_json(&res.stdout, &current_version, GITHUB_REPO) {
                return Ok(parsed);
            }
        }

        Ok(UpdateCheckResult {
            has_update: false,
            current_version: current_version.clone(),
            latest_version: current_version,
            release_url: fallback_url,
            release_notes: None,
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_release_json() {
        let fixture = br#"{"tag_name":"v0.2.0","html_url":"https://github.com/Arpitpatidar00/Stackroost/releases/tag/v0.2.0","body":"Release notes"}"#;
        let res = parse_release_json(fixture, "0.1.0", GITHUB_REPO).unwrap();
        assert!(res.has_update);
        assert_eq!(res.latest_version, "0.2.0");
        assert_eq!(res.current_version, "0.1.0");
        assert_eq!(
            res.release_url,
            "https://github.com/Arpitpatidar00/Stackroost/releases/tag/v0.2.0"
        );
        assert_eq!(res.release_notes.as_deref(), Some("Release notes"));
    }

    #[test]
    fn test_parse_release_same_version() {
        let fixture = br#"{"tag_name":"v0.1.0","html_url":"https://github.com/Arpitpatidar00/Stackroost/releases/tag/v0.1.0","body":null}"#;
        let res = parse_release_json(fixture, "0.1.0", GITHUB_REPO).unwrap();
        assert!(!res.has_update);
        assert_eq!(res.latest_version, "0.1.0");
    }
}
