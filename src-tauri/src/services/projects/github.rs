use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequest {
    pub number: u64,
    pub title: String,
    pub state: String,
    pub url: String,
    pub head_ref_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubStatus {
    pub gh_installed: bool,
    pub logged_in: bool,
    pub pull_requests: Vec<GitHubPullRequest>,
    pub ci_status: Option<String>,
}

pub fn get_github_status(project_path: &Path) -> AppResult<GitHubStatus> {
    // Check if gh is installed
    let gh_installed = Command::new("which")
        .arg("gh")
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if !gh_installed {
        return Ok(GitHubStatus {
            gh_installed: false,
            logged_in: false,
            pull_requests: vec![],
            ci_status: None,
        });
    }

    // Check gh auth status
    let auth_status = Command::new("gh")
        .args(["auth", "status"])
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if !auth_status {
        return Ok(GitHubStatus {
            gh_installed: true,
            logged_in: false,
            pull_requests: vec![],
            ci_status: None,
        });
    }

    // Fetch PRs (read-only)
    let pr_out = Command::new("gh")
        .args([
            "pr",
            "list",
            "--json",
            "number,title,state,url,headRefName",
            "--limit",
            "10",
        ])
        .current_dir(project_path)
        .output();

    let pull_requests: Vec<GitHubPullRequest> = pr_out
        .ok()
        .and_then(|o| serde_json::from_slice(&o.stdout).ok())
        .unwrap_or_default();

    // Check CI status (read-only)
    let ci_out = Command::new("gh")
        .args(["pr", "checks"])
        .current_dir(project_path)
        .output();
    let ci_status = ci_out.ok().and_then(|o| {
        if o.status.success() {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if s.is_empty() {
                None
            } else {
                Some(s)
            }
        } else {
            None
        }
    });

    Ok(GitHubStatus {
        gh_installed: true,
        logged_in: true,
        pull_requests,
        ci_status,
    })
}
