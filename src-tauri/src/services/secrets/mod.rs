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
    let char_count = s.chars().count();
    if char_count <= 8 {
        return "****".to_string();
    }
    let prefix: String = s.chars().take(4).collect();
    let suffix: String = s.chars().skip(char_count.saturating_sub(4)).collect();
    format!("{prefix}****{suffix}")
}

/// Redact only secret pattern matches in arbitrary text while preserving surrounding context.
pub fn redact_secrets_in_text(text: &str) -> String {
    let mut out = text.to_string();

    // 1. Private keys
    if let Ok(re) = regex::Regex::new(
        r"-----BEGIN [A-Z0-9 ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]+PRIVATE KEY-----",
    ) {
        out = re.replace_all(&out, "[REDACTED PRIVATE KEY]").to_string();
    }

    // 2. AWS Access Key
    if let Ok(re) = regex::Regex::new(r"\bAKIA[0-9A-Z]{16}\b") {
        out = re
            .replace_all(&out, |caps: &regex::Captures| mask_secret(&caps[0]))
            .to_string();
    }

    // 3. Stripe Secret Keys
    if let Ok(re) = regex::Regex::new(r"\b(?:sk|rk)_live_[0-9a-zA-Z_]{16,}\b") {
        out = re
            .replace_all(&out, |caps: &regex::Captures| mask_secret(&caps[0]))
            .to_string();
    }

    // 4. GitHub PAT
    if let Ok(re) = regex::Regex::new(r"\b(?:ghp_[0-9a-zA-Z]{36}|github_pat_[0-9a-zA-Z_]{22,})\b") {
        out = re
            .replace_all(&out, |caps: &regex::Captures| mask_secret(&caps[0]))
            .to_string();
    }

    // 5. Slack Token
    if let Ok(re) = regex::Regex::new(
        r"\bxox[baprs]-[0-9a-zA-Z]{10,48}-[0-9a-zA-Z]{10,48}(?:-[0-9a-zA-Z]{10,48})?\b",
    ) {
        out = re
            .replace_all(&out, |caps: &regex::Captures| mask_secret(&caps[0]))
            .to_string();
    }

    // 6. Generic password / secret assignments
    if let Ok(re) = regex::Regex::new(
        r#"(?i)\b(password|passwd|secret|api_key|apikey|auth_token)\s*([:=])\s*['"]?([^\s'"]{6,})['"]?"#,
    ) {
        out = re
            .replace_all(&out, |caps: &regex::Captures| {
                let key = &caps[1];
                let sep = &caps[2];
                let secret_val = &caps[3];
                format!("{key}{sep}{}", mask_secret(secret_val))
            })
            .to_string();
    }

    // 7. Credentials inside URLs: postgres://user:pass@host → user:***@host
    if let Ok(re) = regex::Regex::new(r"(?i)\b([a-z][a-z0-9+.-]*://)([^:/\s@]+):([^@/\s]+)@") {
        out = re.replace_all(&out, "${1}${2}:***@").to_string();
    }

    // 8. Bearer tokens and JWTs
    if let Ok(re) = regex::Regex::new(r"(?i)\bbearer\s+[a-z0-9._~+/=-]{8,}") {
        out = re.replace_all(&out, "Bearer [REDACTED]").to_string();
    }
    if let Ok(re) =
        regex::Regex::new(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}")
    {
        out = re.replace_all(&out, "[REDACTED JWT]").to_string();
    }

    // 9. AI provider keys (Anthropic sk-ant-…, OpenAI sk-proj-… / sk-…)
    if let Ok(re) = regex::Regex::new(r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}") {
        out = re
            .replace_all(&out, |caps: &regex::Captures| mask_secret(&caps[0]))
            .to_string();
    }

    // 10. ssh-style user@host targets — hostnames identify private infra.
    if let Ok(re) = regex::Regex::new(r"\b([A-Za-z0-9._-]+)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)") {
        out = re.replace_all(&out, "${1}@[host]").to_string();
    }

    out
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnvFile {
    /// Real settings (`.env`, `.env.local`, `.env.production`…): never committed.
    Real,
    /// A template meant to be committed (`.env.example`, `.env.sample`…).
    Template,
}

const TEMPLATE_MARKERS: &[&str] = &[
    "example", "sample", "template", "tmpl", "tpl", "dist", "defaults", "default", "schema",
    "skeleton",
];

/// Whether a tracked path is an env file, by its name at any depth.
pub fn env_file_kind(rel: &str) -> Option<EnvFile> {
    let name = rel.rsplit('/').next().unwrap_or(rel).to_ascii_lowercase();
    let is_env = name == ".env"
        || name.starts_with(".env.")
        || name.starts_with(".env-")
        || name.ends_with(".env")
        || name == "env.example";
    if !is_env {
        return None;
    }
    let template = name
        .split(['.', '-', '_'])
        .any(|part| TEMPLATE_MARKERS.contains(&part));
    Some(if template {
        EnvFile::Template
    } else {
        EnvFile::Real
    })
}

/// Values that only look like keys: docs examples and fill-me-in markers.
pub fn looks_like_placeholder(value: &str) -> bool {
    let v = value.to_ascii_lowercase();
    let body: String = v.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    let after_prefix = body
        .trim_start_matches("sklive")
        .trim_start_matches("rklive")
        .trim_start_matches("ghp")
        .trim_start_matches("githubpat")
        .trim_start_matches("xoxb")
        .trim_start_matches("xoxp")
        .trim_start_matches("akia");
    let one_char =
        after_prefix.len() >= 4 && after_prefix.chars().all(|c| after_prefix.starts_with(c));
    one_char
        || [
            "example",
            "xxxx",
            "your",
            "placeholder",
            "changeme",
            "replace",
            "dummy",
            "sample",
            "fake",
            "redacted",
            "insert",
            "todo",
            "0000000",
        ]
        .iter()
        .any(|w| v.contains(w))
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

            // A real env file in git is a finding by itself; a template is
            // meant to be committed, so only a real-looking key inside it is.
            if env_file_kind(rel) == Some(EnvFile::Real) {
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
                            if key.chars().all(|c| c.is_ascii_alphanumeric())
                                && !looks_like_placeholder(
                                    candidate.split_whitespace().next().unwrap_or(key),
                                )
                            {
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
                            if candidate.len() >= 24 && !looks_like_placeholder(&candidate) {
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
                            if candidate.len() >= 36 && !looks_like_placeholder(&candidate) {
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
                            if candidate.len() >= 30 && !looks_like_placeholder(&candidate) {
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
    #[test]
    fn redacts_uris_bearer_jwt_ai_keys_and_hosts() {
        let raw = "postgres://admin:s3cr3tPass@db.example.com:5432/prod \
                   Authorization: Bearer abcdefghijklmnop \
                   eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U \
                   sk-ant-api03-abcdefghijklmnopqrstuvwxyz \
                   ubuntu@prod-db.internal.corp";
        let out = redact_secrets_in_text(raw);
        for leaked in [
            "s3cr3tPass",
            "abcdefghijklmnop",
            "eyJzdWIi",
            "abcdefghijklmnopqrstuvwxyz",
            "prod-db.internal.corp",
        ] {
            assert!(!out.contains(leaked), "{leaked} leaked: {out}");
        }
    }

    use super::*;

    #[test]
    fn env_files_are_told_apart_from_templates() {
        for real in [
            ".env",
            ".env.local",
            ".env.production",
            "apps/web/.env",
            "config/prod.env",
            ".env.development.local",
        ] {
            assert_eq!(env_file_kind(real), Some(EnvFile::Real), "{real}");
        }
        for t in [
            ".env.example",
            ".env.sample",
            ".env.template",
            ".env.dist",
            ".env-example",
            "apps/api/.env.example",
            "example.env",
            "env.example",
            ".env.local.example",
            ".env.defaults",
        ] {
            assert_eq!(env_file_kind(t), Some(EnvFile::Template), "{t}");
        }
        for not in ["environment.ts", "src/env.ts", ".envrc", "README.md"] {
            assert_eq!(env_file_kind(not), None, "{not}");
        }
    }

    #[test]
    fn placeholders_are_not_keys() {
        for p in [
            "AKIAIOSFODNN7EXAMPLE",
            concat!("sk_", "live_", "xxxxxxxxxxxxxxxxxxxxxxxx"),
            concat!("sk_", "live_", "your_stripe_key_here_please"),
            "ghp_000000000000000000000000000000000000",
            "xoxb-your-bot-token-goes-here-123456",
            "AKIAAAAAAAAAAAAAAAAA",
        ] {
            assert!(looks_like_placeholder(p), "{p}");
        }
        for real in [
            "AKIA2E0A8F3B4C5D6E7F",
            concat!("sk_", "live_", "51Hc8q2LkdQ9pXzR7mT4vWbN"),
            "ghp_1a2B3c4D5e6F7g8H9i0JkLmNoPqRsTuVwXyZ",
        ] {
            assert!(!looks_like_placeholder(real), "{real}");
        }
    }

    #[test]
    fn templates_pass_unless_they_hold_a_real_key() {
        let dir = std::env::temp_dir().join(format!("sr-secrets-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("apps/web")).unwrap();
        let git = |args: &[&str]| {
            let ok = Command::new("git")
                .current_dir(&dir)
                .args(args)
                .output()
                .unwrap()
                .status
                .success();
            assert!(ok, "git {args:?}");
        };
        git(&["init", "-q"]);
        std::fs::write(
            dir.join(".env.example"),
            concat!(
                "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nSTRIPE_KEY=sk_",
                "live_",
                "xxxxxxxxxxxxxxxxxxxxxxxx\nDB_PASSWORD=changeme\n"
            ),
        )
        .unwrap();
        std::fs::write(
            dir.join(".env.sample"),
            "AWS_ACCESS_KEY_ID=AKIA2E0A8F3B4C5D6E7F\n",
        )
        .unwrap();
        std::fs::write(dir.join("apps/web/.env"), "API_URL=http://localhost\n").unwrap();
        git(&["add", "-A"]);
        let r = scan_projects(std::slice::from_ref(&dir)).unwrap();
        let got: Vec<(String, String)> = r
            .findings
            .iter()
            .map(|f| (f.file_path.clone(), f.rule_id.clone()))
            .collect();
        // The example file passes; the sample with a real-looking key is
        // caught for the key; a nested real .env is caught as tracked.
        assert!(!got.iter().any(|(f, _)| f == ".env.example"), "{got:?}");
        assert!(
            got.contains(&(".env.sample".into(), "aws_access_key".into())),
            "{got:?}"
        );
        assert!(
            !got.contains(&(".env.sample".into(), "tracked_env".into())),
            "{got:?}"
        );
        assert!(
            got.contains(&("apps/web/.env".into(), "tracked_env".into())),
            "{got:?}"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_mask_secret() {
        let masked = mask_secret("AKIA1234567890ABCDEF");
        assert_eq!(masked, "AKIA****CDEF");
        assert_eq!(mask_secret("short"), "****");
    }

    #[test]
    fn test_redact_secrets_in_text() {
        let text = concat!(
            "Deploy failed with AWS key AKIA1234567890ABCDEF and stripe sk_",
            "live_",
            "1234567890abcdef123456"
        );
        let redacted = redact_secrets_in_text(text);
        assert!(!redacted.contains("AKIA1234567890ABCDEF"));
        assert!(!redacted.contains(concat!("sk_", "live_", "1234567890abcdef123456")));
        assert!(redacted.contains("Deploy failed with AWS key AKIA****CDEF"));
        assert!(redacted.contains("stripe sk_l****3456"));
    }

    #[test]
    fn test_char_safe_masking_multibyte() {
        let multibyte = "🦀🔐🚀🎉super_secret_key_999";
        let masked = mask_secret(multibyte);
        assert!(masked.starts_with("🦀🔐🚀🎉"));
        assert!(masked.ends_with("_999"));
        assert!(masked.contains("****"));
    }
}
