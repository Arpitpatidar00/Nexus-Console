// Apps & AI tools: the big per-app data folders the cleanup catalog doesn't
// cover, each labelled for what deleting it costs. Only `cache` spots (apps
// rebuild them) and individual agent backups can be cleaned; app-managed
// data, models and history are explained, never deleted here.

use super::clean;
use super::measure;
use super::store::Rules;
use super::tools;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::time::SystemTime;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SpotKind {
    /// Rebuilt by the app as it's used. Cleanable while the app is closed.
    Cache,
    /// Copies of your files an AI agent kept to undo a task. Cleanable per task.
    AgentBackup,
    /// The app's own runtime data (a VM, a disk image): explained, not deleted.
    AppManaged,
    /// Downloaded models: removed with the tool's own command.
    Models,
    /// Your history or archives: never deleted here.
    History,
}

struct Spot {
    id: &'static str,
    app: &'static str,
    label: &'static str,
    kind: SpotKind,
    /// `pgrep` name of the app (`<Name>.app/Contents/MacOS`); it must be closed to clean.
    process: Option<&'static str>,
    paths: &'static [&'static str],
    note: &'static str,
}

const SPOTS: &[Spot] = &[
    Spot {
        id: "claude_cache",
        app: "Claude",
        label: "Claude desktop caches",
        kind: SpotKind::Cache,
        process: Some("Claude"),
        paths: &[
            "Library/Application Support/Claude/Cache",
            "Library/Application Support/Claude/Code Cache",
            "Library/Application Support/Claude/GPUCache",
            "Library/Application Support/Claude/DawnGraphiteCache",
            "Library/Application Support/Claude/DawnWebGPUCache",
            "Library/Application Support/Claude/GraphiteDawnCache",
        ],
        note: "Web caches Claude rebuilds as you use it. Quit Claude first.",
    },
    Spot {
        id: "claude_vm",
        app: "Claude",
        label: "Claude's Linux VM",
        kind: SpotKind::AppManaged,
        process: None,
        paths: &[
            "Library/Application Support/Claude/vm_bundles",
            "Library/Application Support/Claude/claude-code-vm",
        ],
        note: "The virtual machine Claude uses to run Claude Code and Cowork on this Mac. \
               Stackroost leaves it to Claude: deleting it only makes Claude download it again.",
    },
    Spot {
        id: "gemini_backups",
        app: "Gemini",
        label: "Gemini agent task backups",
        kind: SpotKind::AgentBackup,
        process: None,
        paths: &[".gemini/tasks"],
        note: "Copies of your files a Gemini agent made before editing them, one per task, so it \
               could undo its changes. Remove a task's backup once you're happy with what it did.",
    },
    Spot {
        id: "gemini_ide",
        app: "Gemini",
        label: "Antigravity IDE data",
        kind: SpotKind::AppManaged,
        process: None,
        paths: &[".gemini/antigravity-ide"],
        note: "Antigravity's own extensions and state. Its caches are in Clean up.",
    },
    Spot {
        id: "codex_sessions",
        app: "Codex",
        label: "Codex session history",
        kind: SpotKind::History,
        process: None,
        paths: &[".codex/sessions"],
        note: "Your Codex conversations. Stackroost never deletes history.",
    },
    Spot {
        id: "cursor_cache",
        app: "Cursor",
        label: "Cursor caches & logs",
        kind: SpotKind::Cache,
        process: Some("Cursor"),
        paths: &[
            "Library/Application Support/Cursor/Cache",
            "Library/Application Support/Cursor/CachedData",
            "Library/Application Support/Cursor/Code Cache",
            "Library/Application Support/Cursor/GPUCache",
            "Library/Application Support/Cursor/logs",
        ],
        note: "Rebuilt by Cursor. Quit Cursor first.",
    },
    Spot {
        id: "vscode_workspaces",
        app: "VS Code",
        label: "VS Code per-project state",
        kind: SpotKind::History,
        process: None,
        paths: &["Library/Application Support/Code/User/workspaceStorage"],
        note: "Each folder you've opened keeps its state here (open editors, extension data, chat). \
               VS Code's caches are in Clean up.",
    },
    Spot {
        id: "slack_cache",
        app: "Slack",
        label: "Slack caches",
        kind: SpotKind::Cache,
        process: Some("Slack"),
        paths: &[
            "Library/Application Support/Slack/Cache",
            "Library/Application Support/Slack/Code Cache",
            "Library/Application Support/Slack/Service Worker/CacheStorage",
            "Library/Containers/com.tinyspeck.slackmacgap/Data/Library/Application Support/Slack/Cache",
            "Library/Containers/com.tinyspeck.slackmacgap/Data/Library/Application Support/Slack/Service Worker/CacheStorage",
        ],
        note: "Images and files Slack re-downloads when you open them. Quit Slack first.",
    },
    Spot {
        id: "discord_cache",
        app: "Discord",
        label: "Discord caches",
        kind: SpotKind::Cache,
        process: Some("Discord"),
        paths: &[
            "Library/Application Support/discord/Cache",
            "Library/Application Support/discord/Code Cache",
            "Library/Application Support/discord/GPUCache",
        ],
        note: "Rebuilt by Discord. Quit Discord first.",
    },
    Spot {
        id: "teams_cache",
        app: "Microsoft Teams",
        label: "Teams caches",
        kind: SpotKind::Cache,
        process: Some("Microsoft Teams"),
        paths: &["Library/Containers/com.microsoft.teams2/Data/Library/Caches"],
        note: "Rebuilt by Teams. Quit Teams first.",
    },
    Spot {
        id: "spotify_cache",
        app: "Spotify",
        label: "Spotify streaming cache",
        kind: SpotKind::Cache,
        process: Some("Spotify"),
        paths: &["Library/Caches/com.spotify.client", "Library/Application Support/Spotify/PersistentCache"],
        note: "Songs Spotify cached while streaming. Downloaded playlists are elsewhere and kept. Quit Spotify first.",
    },
    Spot {
        id: "ollama_models",
        app: "Ollama",
        label: "Ollama models",
        kind: SpotKind::Models,
        process: None,
        paths: &[".ollama/models"],
        note: "`ollama list` shows them; `ollama rm <name>` removes one.",
    },
    Spot {
        id: "hf_cache",
        app: "Hugging Face",
        label: "Hugging Face model cache",
        kind: SpotKind::Models,
        process: None,
        paths: &[".cache/huggingface"],
        note: "Models Python libraries downloaded; they download again when needed. \
               `huggingface-cli delete-cache` lets you pick which to remove.",
    },
    Spot {
        id: "lmstudio_models",
        app: "LM Studio",
        label: "LM Studio models",
        kind: SpotKind::Models,
        process: None,
        paths: &[".lmstudio/models", ".cache/lm-studio/models"],
        note: "Manage them in LM Studio → My Models.",
    },
    Spot {
        id: "docker_disk",
        app: "Docker",
        label: "Docker Desktop disk",
        kind: SpotKind::AppManaged,
        process: None,
        paths: &["Library/Containers/com.docker.docker/Data/vms"],
        note: "Docker's virtual disk. It doesn't shrink on its own: prune with the Docker items in \
               Clean up, or lower Docker Desktop → Settings → Resources → disk limit.",
    },
    Spot {
        id: "xcode_archives",
        app: "Xcode",
        label: "Xcode archives",
        kind: SpotKind::History,
        process: None,
        paths: &["Library/Developer/Xcode/Archives"],
        note: "Builds you archived for TestFlight or the App Store; needed to read their crash logs. \
               Remove old ones in Xcode → Organizer.",
    },
];

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotChild {
    /// Absolute: what a clean names, matched exactly against this report.
    pub path: String,
    pub label: String,
    pub bytes: u64,
    pub modified_epoch: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSpot {
    pub id: String,
    pub app: String,
    pub label: String,
    pub note: String,
    pub kind: SpotKind,
    pub bytes: u64,
    /// `~/…` folders, for display and Reveal.
    pub paths: Vec<String>,
    /// The app is open, so its cache can't be cleaned now.
    pub running: bool,
    pub children: Vec<SpotChild>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppDataReport {
    pub scanned_at: u64,
    pub spots: Vec<AppSpot>,
    /// Caches (apps closed or not) and agent backups.
    pub cleanable_bytes: u64,
}

fn epoch(t: SystemTime) -> u64 {
    t.duration_since(SystemTime::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

fn tilde(p: &Path, home: &Path) -> String {
    p.strip_prefix(home)
        .map(|r| format!("~/{}", r.display()))
        .unwrap_or_else(|_| p.display().to_string())
}

/// `.gemini/tasks/<id>/backup` folders, newest first.
fn gemini_backups(home: &Path, cancel: &AtomicBool) -> Vec<SpotChild> {
    let Ok(rd) = std::fs::read_dir(home.join(".gemini/tasks")) else {
        return vec![];
    };
    let mut out: Vec<SpotChild> = rd
        .flatten()
        .filter_map(|e| {
            let backup = e.path().join("backup");
            // A real folder only: a symlinked "backup" could point anywhere.
            std::fs::symlink_metadata(&backup)
                .ok()
                .filter(|m| m.is_dir())?;
            let modified = std::fs::metadata(e.path())
                .and_then(|m| m.modified())
                .unwrap_or(SystemTime::UNIX_EPOCH);
            Some(SpotChild {
                bytes: measure::du(&[backup.as_path()], &[], cancel).unwrap_or(0),
                label: format!("Task {}", e.file_name().to_string_lossy()),
                path: backup.to_string_lossy().into_owned(),
                modified_epoch: epoch(modified),
            })
        })
        .filter(|c| c.bytes > 0)
        .collect();
    out.sort_by_key(|c| std::cmp::Reverse(c.modified_epoch));
    out
}

/// Measure every spot that exists; drop the empty ones.
pub fn scan(
    home: &Path,
    cancel: &AtomicBool,
    running: &(dyn Fn(&str) -> bool + Sync),
) -> AppDataReport {
    let spots: Vec<AppSpot> = std::thread::scope(|s| {
        let handles: Vec<_> = SPOTS
            .iter()
            .map(|spot| {
                s.spawn(move || {
                    let paths: Vec<PathBuf> = spot.paths.iter().map(|p| home.join(p)).collect();
                    let existing: Vec<&Path> = paths
                        .iter()
                        .map(PathBuf::as_path)
                        .filter(|p| p.exists())
                        .collect();
                    let children = if spot.kind == SpotKind::AgentBackup {
                        gemini_backups(home, cancel)
                    } else {
                        vec![]
                    };
                    let bytes = if spot.kind == SpotKind::AgentBackup {
                        children.iter().map(|c| c.bytes).sum()
                    } else {
                        measure::du(&existing, &[], cancel).unwrap_or(0)
                    };
                    AppSpot {
                        id: spot.id.into(),
                        app: spot.app.into(),
                        label: spot.label.into(),
                        note: spot.note.split_whitespace().collect::<Vec<_>>().join(" "),
                        kind: spot.kind,
                        bytes,
                        paths: existing.iter().map(|p| tilde(p, home)).collect(),
                        running: spot.process.is_some_and(running),
                        children,
                    }
                })
            })
            .collect();
        handles.into_iter().filter_map(|h| h.join().ok()).collect()
    });
    let mut spots: Vec<AppSpot> = spots.into_iter().filter(|s| s.bytes > 0).collect();
    spots.sort_by_key(|s| std::cmp::Reverse(s.bytes));
    AppDataReport {
        scanned_at: epoch(SystemTime::now()),
        cleanable_bytes: spots
            .iter()
            .filter(|s| matches!(s.kind, SpotKind::Cache | SpotKind::AgentBackup))
            .map(|s| s.bytes)
            .sum(),
        spots,
    }
}

pub fn scan_live(home: &Path, cancel: &AtomicBool) -> AppDataReport {
    scan(home, cancel, &tools::app_running)
}

/// A clean target, resolved to real folders: a cache spot's id (its folders
/// come from the table above, never the frontend) or one agent backup path
/// from the latest report.
#[derive(Debug)]
pub struct Resolved {
    pub label: String,
    pub paths: Vec<PathBuf>,
}

pub fn resolve(
    report: &AppDataReport,
    targets: &[String],
    home: &Path,
    rules: &Rules,
    running: &dyn Fn(&str) -> bool,
) -> Result<Vec<Resolved>, String> {
    let mut out = Vec::new();
    for t in targets {
        if let Some(spot) = SPOTS.iter().find(|s| s.id == t) {
            if spot.kind != SpotKind::Cache {
                return Err(format!(
                    "{} isn't something Stackroost deletes.",
                    spot.label
                ));
            }
            if !report.spots.iter().any(|s| s.id == spot.id) {
                return Err(format!(
                    "{} isn't in the latest scan. Rescan and try again.",
                    spot.label
                ));
            }
            if let Some(app) = spot.process.filter(|p| running(p)) {
                return Err(format!("Quit {app} first: it's using these caches."));
            }
            let paths: Vec<PathBuf> = spot
                .paths
                .iter()
                .map(|p| home.join(p))
                .filter(|p| p.exists())
                .collect();
            for p in &paths {
                if let Some(why) = clean::refuse_reason(p, home, rules) {
                    return Err(format!("{}: {why}", tilde(p, home)));
                }
            }
            out.push(Resolved {
                label: spot.label.into(),
                paths,
            });
            continue;
        }
        let child = report
            .spots
            .iter()
            .filter(|s| s.kind == SpotKind::AgentBackup)
            .flat_map(|s| s.children.iter())
            .find(|c| &c.path == t);
        let Some(child) = child else {
            return Err(format!(
                "{t} isn't in the latest scan. Rescan and try again."
            ));
        };
        let p = PathBuf::from(&child.path);
        // Exactly `~/.gemini/tasks/<id>/backup`, nothing above or beside it.
        let shaped = p.file_name().is_some_and(|n| n == "backup")
            && p.parent().and_then(Path::parent) == Some(home.join(".gemini/tasks").as_path());
        if !shaped {
            return Err(format!("{t} isn't an agent backup folder."));
        }
        if let Some(why) = clean::refuse_reason(&p, home, rules) {
            return Err(format!("{}: {why}", tilde(&p, home)));
        }
        out.push(Resolved {
            label: format!("Gemini backup ({})", child.label),
            paths: vec![p],
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    const CLAUDE: &str = "Library/Application Support/Claude";

    fn home() -> PathBuf {
        // Unique per test (not just per process): these tests run in
        // parallel, and a shared path raced and corrupted siblings.
        let d = std::env::temp_dir().join(format!(
            "sr-appdata-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn put(p: &Path, n: usize) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, vec![0u8; n]).unwrap();
    }

    fn rules() -> Rules {
        Rules {
            protected_names: vec![],
            project_roots: vec!["~/Desktop".into()],
            next_idle_days: 7,
            log_age_days: 7,
            stale_node_modules_days: 60,
        }
    }

    #[test]
    fn spots_are_measured_labelled_and_only_caches_and_backups_resolve() {
        let h = home();
        put(&h.join(CLAUDE).join("Cache/data_1"), 40_000);
        put(
            &h.join(CLAUDE).join("vm_bundles/claudevm.bundle/rootfs.img"),
            90_000,
        );
        put(
            &h.join(".gemini/tasks/c_old/backup/Users/me/Desktop/a.txt"),
            60_000,
        );
        put(&h.join(".gemini/tasks/c_old/workspace/plan.md"), 10);
        put(&h.join(".codex/sessions/2026/x.jsonl"), 5_000);

        let quiet = |_: &str| false;
        let r = scan(&h, &AtomicBool::new(false), &quiet);
        let ids: Vec<&str> = r.spots.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "claude_vm",
                "gemini_backups",
                "claude_cache",
                "codex_sessions"
            ]
        );
        let backups = &r.spots[1];
        assert_eq!(backups.children.len(), 1);
        assert_eq!(backups.children[0].label, "Task c_old");
        assert!(r.cleanable_bytes >= backups.bytes + r.spots[2].bytes);
        assert!(!r.spots[0].note.contains("  "), "notes are single-spaced");

        let rules = rules();
        let ok = resolve(
            &r,
            &["claude_cache".into(), backups.children[0].path.clone()],
            &h,
            &rules,
            &quiet,
        )
        .unwrap();
        assert_eq!(ok[0].paths, [h.join(CLAUDE).join("Cache")]);
        assert!(ok[1].paths[0].ends_with("c_old/backup"));
        // App-managed data, history and stray paths never resolve.
        assert!(resolve(&r, &["claude_vm".into()], &h, &rules, &quiet)
            .unwrap_err()
            .contains("isn't something"));
        assert!(resolve(&r, &["codex_sessions".into()], &h, &rules, &quiet).is_err());
        let stray = h
            .join(".gemini/tasks/c_old/workspace")
            .to_string_lossy()
            .into_owned();
        assert!(resolve(&r, &[stray], &h, &rules, &quiet).is_err());
        // An open app blocks its own cache.
        let claude_open = |p: &str| p == "Claude";
        assert!(
            resolve(&r, &["claude_cache".into()], &h, &rules, &claude_open)
                .unwrap_err()
                .contains("Quit Claude")
        );
        let _ = fs::remove_dir_all(&h);
    }

    #[test]
    fn an_empty_home_scans_to_nothing() {
        let h = home();
        let quiet = |_: &str| false;
        let r = scan(&h, &AtomicBool::new(false), &quiet);
        assert!(r.spots.is_empty());
        assert_eq!(r.cleanable_bytes, 0);
        let _ = fs::remove_dir_all(&h);
    }

    #[test]
    fn resolving_a_spot_not_in_the_report_is_refused() {
        let h = home();
        put(&h.join(CLAUDE).join("Cache/data_1"), 40_000);
        let quiet = |_: &str| false;
        let r = scan(&h, &AtomicBool::new(false), &quiet);
        // claude_cache is real and in SPOTS, but wasn't put in the report
        // (simulate a stale frontend report by using an empty one instead).
        let empty = AppDataReport {
            scanned_at: 0,
            spots: vec![],
            cleanable_bytes: 0,
        };
        let err = resolve(&empty, &["claude_cache".into()], &h, &rules(), &quiet).unwrap_err();
        assert!(err.contains("isn't in the latest scan"), "{err}");
        let _ = fs::remove_dir_all(&h);
        let _ = r; // silence unused if the assertion above changes
    }

    #[test]
    fn an_unknown_target_is_refused() {
        let h = home();
        let r = scan(&h, &AtomicBool::new(false), &|_: &str| false);
        let err = resolve(
            &r,
            &["not_a_real_spot_id".into()],
            &h,
            &rules(),
            &|_: &str| false,
        )
        .unwrap_err();
        assert!(err.contains("isn't in the latest scan"), "{err}");
        let _ = fs::remove_dir_all(&h);
    }

    #[test]
    fn a_backup_path_that_is_not_shaped_like_task_backup_is_refused() {
        let h = home();
        put(
            &h.join(".gemini/tasks/c_old/backup/Users/me/Desktop/a.txt"),
            60_000,
        );
        let quiet = |_: &str| false;
        let r = scan(&h, &AtomicBool::new(false), &quiet);
        // Not the backup folder itself — a file inside it. Even though it's
        // a real path on disk, it isn't the shape `resolve` requires, so it
        // must be refused rather than silently deleting an arbitrary file.
        let not_shaped = h
            .join(".gemini/tasks/c_old/backup/Users/me/Desktop/a.txt")
            .to_string_lossy()
            .into_owned();
        let err = resolve(&r, &[not_shaped], &h, &rules(), &quiet).unwrap_err();
        assert!(
            err.contains("isn't an agent backup folder")
                || err.contains("isn't in the latest scan"),
            "{err}"
        );
        let _ = fs::remove_dir_all(&h);
    }

    #[test]
    fn a_protected_project_root_blocks_resolution() {
        let h = home();
        put(&h.join(CLAUDE).join("Cache/data_1"), 40_000);
        let quiet = |_: &str| false;
        let r = scan(&h, &AtomicBool::new(false), &quiet);
        // Rules protect the folder itself via `is_protected`, exercised here
        // through a rule set whose project_roots cover the cache path, same
        // as a real project-root guard would.
        let mut blocking_rules = rules();
        blocking_rules.protected_names = vec!["Cache".into()];
        let err = resolve(&r, &["claude_cache".into()], &h, &blocking_rules, &quiet).unwrap_err();
        assert!(err.contains("protected"), "{err}");
        let _ = fs::remove_dir_all(&h);
    }
}
