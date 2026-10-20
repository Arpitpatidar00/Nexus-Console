use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretFinding {
    pub id: String,
    pub project_path: String,
    pub file_path: String,
    pub line_number: Option<usize>,
    pub rule_id: String,
    pub rule_name: String,
    pub severity: String,
    pub masked_preview: String,
    pub remediation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretsScanResult {
    pub scanned_projects: usize,
    pub scanned_files: usize,
    pub findings: Vec<SecretFinding>,
}

pub fn mask_secret(secret: &str) -> String {
    let s = secret.trim();
    if s.len() <= 8 {
        return "****".to_string();
    }
    let prefix: String = s.chars().take(4).collect();
    let suffix: String = s.chars().skip(s.len().saturating_sub(4)).collect();
    format!("{prefix}****{suffix}")
}

pub fn scan_projects(paths: &[PathBuf]) -> AppResult<SecretsScanResult> {
    let mut findings = Vec::new();
    let mut scanned_files = 0;

    for project_dir in paths {
        if !project_dir.exists() || !project_dir.join(".git").exists() {
            continue;
        }
        let proj_str = project_dir.to_string_lossy().to_string();

        // 1. Check unignored .env files in working tree
        let env_path = project_dir.join(".env");
        if env_path.exists() {
            let check_ignore = Command::new("git")
                .current_dir(project_dir)
                .args(["check-ignore", "-q", ".env"])
                .status();
            if let Ok(st) = check_ignore {
                if !st.success() {
                    findings.push(SecretFinding {
                        id: format!("unignored_env_{}", findings.len()),
                        project_path: proj_str.clone(),
                        file_path: ".env".into(),
                        line_number: None,
                        rule_id: "unignored_env".into(),
                        rule_name: ".env file is not gitignored".into(),
                        severity: "critical".into(),
                        masked_preview: ".env present in repo without .gitignore entry".into(),
                        remediation:
                            "Add .env to your .gitignore immediately to prevent accidental commits."
                                .into(),
                    });
                }
            }
        }

        // 2. List git tracked files via git ls-files
        let out = Command::new("git")
            .current_dir(project_dir)
            .args(["ls-files"])
            .output();

        let stdout = match out {
            Ok(o) => String::from_utf8_lossy(&o.stdout).to_string(),
            Err(_) => continue,
        };

        for rel_file in stdout.lines() {
            let rel = rel_file.trim();
            if rel.is_empty() {
                continue;
            }
            scanned_files += 1;
            let full_file = project_dir.join(rel);

            // Check if tracked file is an env file
            if rel == ".env" || rel.starts_with(".env.") {
                findings.push(SecretFinding {
                    id: format!("tracked_env_{}", findings.len()),
                    project_path: proj_str.clone(),
                    file_path: rel.to_string(),
                    line_number: None,
                    rule_id: "tracked_env".into(),
                    rule_name: "Committed .env file tracked by Git".into(),
                    severity: "critical".into(),
                    masked_preview: format!("Tracked file: {rel}"),
                    remediation: format!("Run: git rm --cached {rel} && echo {rel} >> .gitignore"),
                });
                continue;
            }

            // Check file size (skip files > 1MB)
            if let Ok(meta) = std::fs::metadata(&full_file) {
                if meta.len() > 1_000_000 {
                    continue;
                }
            }

            // Read file content and check regexes
            if let Ok(content) = std::fs::read_to_string(&full_file) {
                for (idx, line) in content.lines().enumerate() {
                    let line_no = idx + 1;
                    let tline = line.trim();
                    if tline.is_empty() || tline.starts_with("//") || tline.starts_with("#") {
                        continue;
                    }

                    // AWS Access Key
                    if let Some(pos) = tline.find("AKIA") {
                        let candidate = &tline[pos..];
                        if candidate.len() >= 20 {
                            let key = &candidate[..20];
                            if key.chars().all(|c| c.is_ascii_alphanumeric()) {
                                findings.push(SecretFinding {
                                    id: format!("aws_key_{}", findings.len()),
                                    project_path: proj_str.clone(),
                                    file_path: rel.to_string(),
                                    line_number: Some(line_no),
                                    rule_id: "aws_access_key".into(),
                                    rule_name: "AWS Access Key ID".into(),
                                    severity: "critical".into(),
                                    masked_preview: mask_secret(key),
                                    remediation: "Rotate the AWS access key in AWS IAM console and remove it from source code.".into(),
                                });
                            }
                        }
                    }

                    // Stripe secret key
                    if tline.contains("sk_live_") || tline.contains("rk_live_") {
                        let pattern = if tline.contains("sk_live_") {
                            "sk_live_"
                        } else {
                            "rk_live_"
                        };
                        if let Some(pos) = tline.find(pattern) {
                            let candidate: String = tline[pos..]
                                .chars()
                                .take_while(|c| c.is_ascii_alphanumeric() || *c == '_')
                                .collect();
                            if candidate.len() >= 24 {
                                findings.push(SecretFinding {
                                    id: format!("stripe_key_{}", findings.len()),
                                    project_path: proj_str.clone(),
                                    file_path: rel.to_string(),
                                    line_number: Some(line_no),
                                    rule_id: "stripe_secret".into(),
                                    rule_name: "Stripe Live Secret Key".into(),
                                    severity: "critical".into(),
                                    masked_preview: mask_secret(&candidate),
                                    remediation: "Revoke this key in the Stripe Dashboard immediately and replace with an environment variable.".into(),
                                });
                            }
                        }
                    }

                    // GitHub PAT
                    if tline.contains("ghp_") || tline.contains("github_pat_") {
                        let pattern = if tline.contains("ghp_") {
                            "ghp_"
                        } else {
                            "github_pat_"
                        };
                        if let Some(pos) = tline.find(pattern) {
                            let candidate: String = tline[pos..]
                                .chars()
                                .take_while(|c| c.is_ascii_alphanumeric() || *c == '_')
                                .collect();
                            if candidate.len() >= 36 {
                                findings.push(SecretFinding {
                                    id: format!("github_pat_{}", findings.len()),
                                    project_path: proj_str.clone(),
                                    file_path: rel.to_string(),
                                    line_number: Some(line_no),
                                    rule_id: "github_pat".into(),
                                    rule_name: "GitHub Personal Access Token".into(),
                                    severity: "critical".into(),
                                    masked_preview: mask_secret(&candidate),
                                    remediation: "Revoke this token in GitHub Settings -> Developer Settings -> Personal access tokens.".into(),
                                });
                            }
                        }
                    }

                    // Private Key Header
                    if tline.contains("BEGIN RSA PRIVATE KEY")
                        || tline.contains("BEGIN OPENSSH PRIVATE KEY")
                        || tline.contains("BEGIN PRIVATE KEY")
                    {
                        findings.push(SecretFinding {
                            id: format!("private_key_{}", findings.len()),
                            project_path: proj_str.clone(),
                            file_path: rel.to_string(),
                            line_number: Some(line_no),
                            rule_id: "private_key".into(),
                            rule_name: "Unencrypted Private Key".into(),
                            severity: "critical".into(),
                            masked_preview: "-----BEGIN ... PRIVATE KEY-----".into(),
                            remediation: "Never commit private keys to git. Remove the file from git history and re-generate your key pair.".into(),
                        });
                    }

                    // Slack Token
                    if tline.contains("xoxb-") || tline.contains("xoxp-") {
                        let pattern = if tline.contains("xoxb-") {
                            "xoxb-"
                        } else {
                            "xoxp-"
                        };
                        if let Some(pos) = tline.find(pattern) {
                            let candidate: String = tline[pos..]
                                .chars()
                                .take_while(|c| c.is_ascii_alphanumeric() || *c == '-')
                                .collect();
                            if candidate.len() >= 30 {
                                findings.push(SecretFinding {
                                    id: format!("slack_token_{}", findings.len()),
                                    project_path: proj_str.clone(),
                                    file_path: rel.to_string(),
                                    line_number: Some(line_no),
                                    rule_id: "slack_token".into(),
                                    rule_name: "Slack API Token".into(),
                                    severity: "high".into(),
                                    masked_preview: mask_secret(&candidate),
                                    remediation:
                                        "Rotate the Slack app token in the Slack API dashboard."
                                            .into(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(SecretsScanResult {
        scanned_projects: paths.len(),
        scanned_files,
        findings,
    })
}

pub fn scan_shell_history() -> AppResult<Vec<SecretFinding>> {
    let mut findings = Vec::new();
    let home = std::env::var("HOME").map_err(|e| AppError::Io(format!("no HOME env: {e}")))?;
    let history_files = [".zsh_history", ".bash_history"];

    for hfile in history_files {
        let path = Path::new(&home).join(hfile);
        if !path.exists() {
            continue;
        }
        if let Ok(content) = std::fs::read_to_string(&path) {
            for (idx, line) in content.lines().enumerate() {
                let line_no = idx + 1;
                if line.contains("AWS_SECRET_ACCESS_KEY=") || line.contains("AKIA") {
                    findings.push(SecretFinding {
                        id: format!("hist_aws_{}", findings.len()),
                        project_path: "~".into(),
                        file_path: hfile.into(),
                        line_number: Some(line_no),
                        rule_id: "history_aws".into(),
                        rule_name: "AWS credentials in shell history".into(),
                        severity: "high".into(),
                        masked_preview: "export AWS_SECRET_ACCESS_KEY=****".into(),
                        remediation: format!(
                            "Delete line {line_no} from ~/{hfile} or clear history."
                        ),
                    });
                } else if line.contains("sk_live_") {
                    findings.push(SecretFinding {
                        id: format!("hist_stripe_{}", findings.len()),
                        project_path: "~".into(),
                        file_path: hfile.into(),
                        line_number: Some(line_no),
                        rule_id: "history_stripe".into(),
                        rule_name: "Stripe key in shell history".into(),
                        severity: "high".into(),
                        masked_preview: "sk_live_****".into(),
                        remediation: format!("Delete line {line_no} from ~/{hfile}."),
                    });
                }
            }
        }
    }

    Ok(findings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mask_secret() {
        let masked = mask_secret("AKIA1234567890ABCDEF");
        assert_eq!(masked, "AKIA****CDEF");
        assert_eq!(mask_secret("short"), "****");
    }
}
