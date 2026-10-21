// Local-only error log + "Copy diagnostics" (PLAN G.4). Nothing here is sent
// anywhere: the log lives in the app data dir, and the report is text the user
// copies themselves, with secrets and the home path redacted.

use crate::core::error::AppResult;
use crate::core::store::{load_store, save_store};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const FILE_NAME: &str = "errors.json";
const CAP: usize = 200;
const MESSAGE_MAX: usize = 2_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorEntry {
    pub epoch_ms: u64,
    /// `ipc` (a command failed), `ui` (React crash), `panic` (Rust).
    pub source: String,
    pub kind: String,
    pub message: String,
    pub command: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ErrorLog {
    #[serde(default)]
    pub entries: Vec<ErrorEntry>,
}

static DIR: Mutex<Option<PathBuf>> = Mutex::new(None);

pub fn set_dir(dir: PathBuf) {
    *DIR.lock().unwrap_or_else(|e| e.into_inner()) = Some(dir);
}

fn dir() -> Option<PathBuf> {
    DIR.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Newest first, capped; messages truncated on a char boundary.
pub fn push_in(dir: &Path, mut e: ErrorEntry) -> AppResult<()> {
    if e.message.chars().count() > MESSAGE_MAX {
        e.message = e.message.chars().take(MESSAGE_MAX).collect::<String>() + "…";
    }
    let path = dir.join(FILE_NAME);
    let mut log: ErrorLog = load_store(&path);
    log.entries.insert(0, e);
    log.entries.truncate(CAP);
    save_store(&path, &log, true)
}

pub fn push(e: ErrorEntry) -> AppResult<()> {
    match dir() {
        Some(d) => push_in(&d, e),
        None => Ok(()),
    }
}

pub fn list_in(dir: &Path) -> Vec<ErrorEntry> {
    load_store::<ErrorLog>(dir.join(FILE_NAME)).entries
}

pub fn list() -> Vec<ErrorEntry> {
    dir().map(|d| list_in(&d)).unwrap_or_default()
}

pub fn clear() -> AppResult<()> {
    match dir() {
        Some(d) => save_store(d.join(FILE_NAME), &ErrorLog::default(), true),
        None => Ok(()),
    }
}

/// Record Rust panics in the log, then defer to the default hook.
pub fn install_panic_hook() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let _ = push(ErrorEntry {
            epoch_ms: now_ms(),
            source: "panic".into(),
            kind: "panic".into(),
            message: info.to_string(),
            command: None,
        });
        default(info);
    }));
}

/// Secrets masked by the scanner's patterns; the home directory becomes `~`.
pub fn redact(text: &str, home: &str) -> String {
    let masked = crate::services::secrets::redact_secrets_in_text(text);
    if home.len() > 1 {
        masked.replace(home, "~")
    } else {
        masked
    }
}

pub struct ReportInfo<'a> {
    pub version: &'a str,
    pub git_sha: &'a str,
    pub build_epoch: u64,
    pub macos: &'a str,
    pub arch: &'a str,
    pub modules: &'a str,
}

pub fn report(info: &ReportInfo, entries: &[ErrorEntry], home: &str) -> String {
    let mut out = format!(
        "Stackroost {} ({}) built {}\nmacOS {} · {}\nModules: {}\n\nRecent errors ({} of {}):\n",
        info.version,
        info.git_sha,
        info.build_epoch,
        info.macos,
        info.arch,
        info.modules,
        entries.len().min(50),
        entries.len()
    );
    if entries.is_empty() {
        out.push_str("  none\n");
    }
    for e in entries.iter().take(50) {
        out.push_str(&format!(
            "- {} [{}/{}]{} {}\n",
            e.epoch_ms,
            e.source,
            e.kind,
            e.command
                .as_deref()
                .map(|c| format!(" {c}"))
                .unwrap_or_default(),
            e.message.replace('\n', " ")
        ));
    }
    redact(&out, home)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("stackroost_diag_{name}_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    fn entry(msg: &str) -> ErrorEntry {
        ErrorEntry {
            epoch_ms: 1,
            source: "ipc".into(),
            kind: "io".into(),
            message: msg.into(),
            command: Some("maclean_scan".into()),
        }
    }

    #[test]
    fn log_is_newest_first_and_capped() {
        let d = tmp("cap");
        for i in 0..(CAP + 5) {
            push_in(&d, entry(&i.to_string())).unwrap();
        }
        let all = list_in(&d);
        assert_eq!(all.len(), CAP);
        assert_eq!(all[0].message, (CAP + 4).to_string());
    }

    #[test]
    fn long_multibyte_messages_truncate_safely() {
        let d = tmp("trunc");
        push_in(&d, entry(&"é".repeat(MESSAGE_MAX + 10))).unwrap();
        let m = &list_in(&d)[0].message;
        assert_eq!(m.chars().count(), MESSAGE_MAX + 1);
    }

    #[test]
    fn report_redacts_home_and_secrets() {
        let info = ReportInfo {
            version: "0.1.0",
            git_sha: "abc",
            build_epoch: 0,
            macos: "15.0",
            arch: "aarch64",
            modules: "homebrew",
        };
        let e = entry("failed reading /Users/me/.aws/credentials with AKIAIOSFODNN7EXAMPLE");
        let r = report(&info, &[e], "/Users/me");
        assert!(r.contains("~/.aws/credentials"));
        assert!(!r.contains("/Users/me"));
        assert!(!r.contains("AKIAIOSFODNN7EXAMPLE"));
        assert!(r.contains("Stackroost 0.1.0 (abc)"));
    }
}
