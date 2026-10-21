use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitInfo {
    pub hash: String,
    pub message: String,
    pub relative_time: String,
    pub author: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch: String,
    pub dirty_count: usize,
    pub ahead: usize,
    pub behind: usize,
    pub stash_count: usize,
    pub last_commit: Option<GitCommitInfo>,
    pub merged_branches: Vec<String>,
}

pub fn get_git_status(path: &Path) -> AppResult<GitStatus> {
    if !path.join(".git").exists() {
        return Err(AppError::NotFound("Not a git repository".into()));
    }

    // 1. Current branch
    let branch_out = Command::new("git")
        .args([
            "-C",
            path.to_str().unwrap_or(""),
            "rev-parse",
            "--abbrev-ref",
            "HEAD",
        ])
        .output()
        .map_err(|e| AppError::Io(format!("git rev-parse: {e}")))?;
    let branch = String::from_utf8_lossy(&branch_out.stdout)
        .trim()
        .to_string();

    // 2. Dirty count
    let status_out = Command::new("git")
        .args(["-C", path.to_str().unwrap_or(""), "status", "--porcelain"])
        .output()
        .map_err(|e| AppError::Io(format!("git status: {e}")))?;
    let dirty_count = parse_git_status_porcelain(&String::from_utf8_lossy(&status_out.stdout));

    // 3. Ahead / Behind vs upstream
    let mut ahead = 0;
    let mut behind = 0;
    let counts_out = Command::new("git")
        .args([
            "-C",
            path.to_str().unwrap_or(""),
            "rev-list",
            "--left-right",
            "--count",
            "HEAD...@{u}",
        ])
        .output();
    if let Ok(o) = counts_out {
        if o.status.success() {
            let (a, b) = parse_git_rev_list_counts(&String::from_utf8_lossy(&o.stdout));
            ahead = a;
            behind = b;
        }
    }

    // 4. Stashes
    let stash_out = Command::new("git")
        .args(["-C", path.to_str().unwrap_or(""), "stash", "list"])
        .output();
    let stash_count = stash_out
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).lines().count())
        .unwrap_or(0);

    // 5. Last commit
    let log_out = Command::new("git")
        .args([
            "-C",
            path.to_str().unwrap_or(""),
            "log",
            "-1",
            "--format=%h%x09%s%x09%cr%x09%an",
        ])
        .output();
    let last_commit = log_out.ok().and_then(|o| {
        if o.status.success() {
            parse_git_commit_log(&String::from_utf8_lossy(&o.stdout))
        } else {
            None
        }
    });

    // 6. Merged branches (excluding current branch, master, main)
    let merged_out = Command::new("git")
        .args(["-C", path.to_str().unwrap_or(""), "branch", "--merged"])
        .output();
    let merged_branches = if let Ok(o) = merged_out {
        parse_git_merged_branches(&String::from_utf8_lossy(&o.stdout), &branch)
    } else {
        Vec::new()
    };

    Ok(GitStatus {
        branch,
        dirty_count,
        ahead,
        behind,
        stash_count,
        last_commit,
        merged_branches,
    })
}

pub fn git_fetch(path: &Path) -> AppResult<()> {
    let out = Command::new("git")
        .args(["-C", path.to_str().unwrap_or(""), "fetch"])
        .output()
        .map_err(|e| AppError::Io(format!("git fetch: {e}")))?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(AppError::Io(format!("git fetch failed: {err}")));
    }
    Ok(())
}

pub fn delete_merged_branches(path: &Path, branches: &[String]) -> AppResult<Vec<String>> {
    let mut deleted = Vec::new();
    for b in branches {
        if b == "main" || b == "master" {
            continue;
        }
        let status = Command::new("git")
            .args(["-C", path.to_str().unwrap_or(""), "branch", "-d", b])
            .status();
        if let Ok(s) = status {
            if s.success() {
                deleted.push(b.clone());
            }
        }
    }
    Ok(deleted)
}

pub fn parse_git_status_porcelain(stdout: &str) -> usize {
    stdout.lines().filter(|l| !l.trim().is_empty()).count()
}

pub fn parse_git_rev_list_counts(stdout: &str) -> (usize, usize) {
    let parts: Vec<&str> = stdout.split_whitespace().collect();
    if parts.len() == 2 {
        (parts[0].parse().unwrap_or(0), parts[1].parse().unwrap_or(0))
    } else {
        (0, 0)
    }
}

pub fn parse_git_commit_log(stdout: &str) -> Option<GitCommitInfo> {
    let p: Vec<&str> = stdout.trim().split('\t').collect();
    if p.len() >= 4 {
        Some(GitCommitInfo {
            hash: p[0].to_string(),
            message: p[1].to_string(),
            relative_time: p[2].to_string(),
            author: p[3].to_string(),
        })
    } else {
        None
    }
}

pub fn parse_git_merged_branches(stdout: &str, current_branch: &str) -> Vec<String> {
    let mut merged_branches = Vec::new();
    for line in stdout.lines() {
        let b = line.trim().trim_start_matches('*').trim();
        if !b.is_empty() && b != "main" && b != "master" && b != current_branch && !b.contains("->")
        {
            merged_branches.push(b.to_string());
        }
    }
    merged_branches
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitBranchVvEntry {
    pub name: String,
    pub commit: String,
    pub upstream: Option<String>,
    pub is_head: bool,
}

pub fn parse_git_branch_vv(stdout: &str) -> Vec<GitBranchVvEntry> {
    let mut entries = Vec::new();
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let is_head = line.starts_with('*');
        let clean = trimmed.trim_start_matches('*').trim();
        let parts: Vec<&str> = clean.split_whitespace().collect();
        if parts.len() >= 2 {
            let name = parts[0].to_string();
            let commit = parts[1].to_string();
            let upstream = if let Some(start) = clean.find('[') {
                if let Some(end) = clean.find(']') {
                    if start < end {
                        let bracket_content = &clean[start + 1..end];
                        Some(bracket_content.split(':').next().unwrap_or("").to_string())
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            };
            entries.push(GitBranchVvEntry {
                name,
                commit,
                upstream,
                is_head,
            });
        }
    }
    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_git_status_struct() {
        let status = GitStatus {
            branch: "main".into(),
            dirty_count: 0,
            ahead: 0,
            behind: 0,
            stash_count: 0,
            last_commit: None,
            merged_branches: vec![],
        };
        assert_eq!(status.branch, "main");
    }
}
