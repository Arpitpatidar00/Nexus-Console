// `maclean.json` (app data dir): the user's cleanup rules and the clean-run
// journal. Rust owns it because Rust enforces the rules (docs/maclean/PLAN.md §2).

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

pub const FILE_NAME: &str = "maclean.json";
pub const JOURNAL_CAP: usize = 500;

/// The script's settings block, same defaults.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Rules {
    /// Any path containing one of these is never touched.
    pub protected_names: Vec<String>,
    /// Where to look for idle `.next` builds and stale node_modules (`~/` allowed).
    pub project_roots: Vec<String>,
    pub next_idle_days: u32,
    pub log_age_days: u32,
    pub stale_node_modules_days: u32,
}

impl Default for Rules {
    fn default() -> Self {
        Rules {
            protected_names: vec!["Fameo".into()],
            project_roots: vec!["~/Desktop".into()],
            next_idle_days: 7,
            log_age_days: 7,
            stale_node_modules_days: 60,
        }
    }
}

impl Rules {
    pub fn is_protected(&self, path: &Path) -> bool {
        let p = path.to_string_lossy();
        self.protected_names
            .iter()
            .any(|n| !n.is_empty() && p.contains(n.as_str()))
    }

    /// Project roots as absolute paths inside `home`; anything else is dropped.
    pub fn roots(&self, home: &Path) -> Vec<PathBuf> {
        self.project_roots
            .iter()
            .filter_map(|r| {
                let p = match r.strip_prefix("~/") {
                    Some(rest) => home.join(rest),
                    None if r == "~" => home.to_path_buf(),
                    None => PathBuf::from(r),
                };
                (p.starts_with(home) && !r.split('/').any(|s| s == "..")).then_some(p)
            })
            .collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub at_epoch: u64,
    pub items: Vec<String>,
    pub freed_bytes: u64,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Store {
    #[serde(default)]
    pub rules: Rules,
    #[serde(default)]
    pub journal: Vec<JournalEntry>,
}

impl Store {
    pub fn append_journal(&mut self, e: JournalEntry) {
        self.journal.insert(0, e);
        self.journal.truncate(JOURNAL_CAP);
    }

    /// Missing or corrupt → defaults (a corrupt file is kept aside as `.corrupt`).
    pub fn load(path: &Path) -> Store {
        let Ok(raw) = fs::read_to_string(path) else {
            return Store::default();
        };
        serde_json::from_str(&raw).unwrap_or_else(|_| {
            let _ = fs::rename(path, path.with_extension("json.corrupt"));
            Store::default()
        })
    }

    pub fn save(&self, path: &Path) -> AppResult<()> {
        let io = |e: std::io::Error| AppError::Io(format!("saving {FILE_NAME}: {e}"));
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).map_err(io)?;
        }
        let json = serde_json::to_vec_pretty(self)
            .map_err(|e| AppError::Parse(format!("serializing {FILE_NAME}: {e}")))?;
        let tmp = path.with_extension("json.tmp");
        fs::write(&tmp, json).map_err(io)?;
        fs::rename(&tmp, path).map_err(io)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_the_script() {
        let r = Rules::default();
        assert_eq!(r.protected_names, ["Fameo"]);
        assert_eq!(r.project_roots, ["~/Desktop"]);
        assert_eq!(
            (r.next_idle_days, r.log_age_days, r.stale_node_modules_days),
            (7, 7, 60)
        );
    }

    #[test]
    fn protection_is_a_substring_match_like_the_script() {
        let r = Rules::default();
        assert!(r.is_protected(Path::new("/Users/me/Desktop/Fameo/web/.next")));
        assert!(r.is_protected(Path::new("/Users/me/Desktop/FameoAdmin/.next")));
        assert!(!r.is_protected(Path::new("/Users/me/Desktop/shop/.next")));
        let none = Rules {
            protected_names: vec![String::new()],
            ..Rules::default()
        };
        assert!(
            !none.is_protected(Path::new("/anything")),
            "an empty name protects nothing"
        );
    }

    #[test]
    fn roots_stay_inside_home() {
        let r = Rules {
            project_roots: vec![
                "~/Desktop".into(),
                "/etc".into(),
                "~/../other".into(),
                "/Users/me/code".into(),
            ],
            ..Rules::default()
        };
        let home = Path::new("/Users/me");
        assert_eq!(
            r.roots(home),
            [
                PathBuf::from("/Users/me/Desktop"),
                PathBuf::from("/Users/me/code")
            ]
        );
    }

    #[test]
    fn partial_and_corrupt_files() {
        let dir = std::env::temp_dir().join(format!("maclean-store-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(FILE_NAME);
        fs::write(&path, r#"{"rules":{"logAgeDays":30}}"#).unwrap();
        let s = Store::load(&path);
        assert_eq!(s.rules.log_age_days, 30);
        assert_eq!(
            s.rules.protected_names,
            ["Fameo"],
            "missing fields take the defaults"
        );
        fs::write(&path, "{nope").unwrap();
        assert_eq!(Store::load(&path).rules, Rules::default());
        assert!(path.with_extension("json.corrupt").exists());
    }
}
