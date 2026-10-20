// Ghost leftovers detection for Mac Clean (P9.1).
// High-confidence leftovers: Caches, Preferences, Saved Application State, HTTPStorages
// for uninstalled apps, and dead LaunchAgents.
// Never touches Containers / Group Containers. Application Support is reported as
// possible/reveal-only.

use crate::services::maclean::clean::move_to_trash;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GhostKind {
    Cache,
    Preference,
    SavedState,
    HttpStorage,
    LaunchAgent,
    PossibleAppSupport,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhostLeftover {
    pub id: String,
    pub name: String,
    pub bundle_id: Option<String>,
    pub path: String,
    pub size_bytes: u64,
    pub modified_at: u64,
    pub kind: GhostKind,
    pub is_safe: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhostScanReport {
    pub leftovers: Vec<GhostLeftover>,
    pub total_reclaimable_bytes: u64,
    pub scan_time_epoch: u64,
}

/// Recursively discovers installed bundle identifiers across system and user app dirs.
pub fn installed_bundle_ids() -> HashSet<String> {
    let mut ids = HashSet::new();
    let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/devarpit".to_string());
    let user_apps = PathBuf::from(&home).join("Applications");

    let app_roots = [
        Path::new("/Applications"),
        Path::new("/System/Applications"),
        &user_apps,
    ];

    for root in &app_roots {
        if !root.exists() {
            continue;
        }
        collect_bundle_ids_in_dir(root, &mut ids, 0);
    }

    // Also include brew list --cask if homebrew is installed
    if let Ok(out) = Command::new("brew").args(["list", "--cask"]).output() {
        if out.status.success() {
            for line in String::from_utf8_lossy(&out.stdout).lines() {
                let cask = line.trim();
                if !cask.is_empty() {
                    ids.insert(cask.to_string());
                }
            }
        }
    }

    ids
}

fn collect_bundle_ids_in_dir(dir: &Path, ids: &mut HashSet<String>, depth: usize) {
    if depth > 2 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            if p.extension().is_some_and(|ext| ext == "app") {
                if let Some(bid) = extract_bundle_id(&p) {
                    ids.insert(bid);
                }
            } else {
                collect_bundle_ids_in_dir(&p, ids, depth + 1);
            }
        }
    }
}

pub fn extract_bundle_id(app_path: &Path) -> Option<String> {
    let plist_path = app_path.join("Contents").join("Info.plist");
    if !plist_path.exists() {
        return None;
    }
    // Fast path: text read
    if let Ok(content) = fs::read_to_string(&plist_path) {
        if let Some(bid) = parse_bundle_id_from_xml(&content) {
            return Some(bid);
        }
    }

    // Fallback: plutil
    if let Ok(out) = Command::new("plutil")
        .args(["-extract", "CFBundleIdentifier", "raw", "-o", "-"])
        .arg(&plist_path)
        .output()
    {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !s.is_empty() {
                return Some(s);
            }
        }
    }

    None
}

pub fn parse_bundle_id_from_xml(xml: &str) -> Option<String> {
    let key_idx = xml.find("CFBundleIdentifier")?;
    let rem = &xml[key_idx..];
    let start_tag = rem.find("<string>")? + "<string>".len();
    let after_start = &rem[start_tag..];
    let end_tag = after_start.find("</string>")?;
    let val = after_start[..end_tag].trim().to_string();
    if val.is_empty() {
        None
    } else {
        Some(val)
    }
}

fn path_size_and_mtime(path: &Path) -> (u64, u64) {
    let meta = fs::symlink_metadata(path).ok();
    let mtime = meta
        .as_ref()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_secs());

    let size = if path.is_file() {
        meta.as_ref().map_or(0, |m| m.len())
    } else if path.is_dir() {
        let mut sum = 0;
        let mut stack = vec![path.to_path_buf()];
        while let Some(dir) = stack.pop() {
            if let Ok(entries) = fs::read_dir(&dir) {
                for e in entries.flatten() {
                    let ep = e.path();
                    if let Ok(em) = fs::symlink_metadata(&ep) {
                        if em.is_dir() {
                            stack.push(ep);
                        } else {
                            sum += em.len();
                        }
                    }
                }
            }
        }
        sum
    } else {
        0
    };

    (size, mtime)
}

/// Identifies if a string looks like a third-party reverse-domain bundle identifier
pub fn is_third_party_bundle_id(name: &str) -> bool {
    let clean = name.strip_suffix(".plist").unwrap_or(name);
    let clean = clean.strip_suffix(".savedState").unwrap_or(clean);
    let clean = clean.strip_suffix(".binarycookies").unwrap_or(clean);

    if !clean.contains('.') {
        return false;
    }
    // Never flag system apple identifiers
    if clean.starts_with("com.apple.") || clean.starts_with("apple.") {
        return false;
    }
    true
}

pub fn scan_ghost_leftovers(home: &Path) -> GhostScanReport {
    let installed = installed_bundle_ids();
    let mut leftovers = Vec::new();

    let library = home.join("Library");

    // 1. Caches (~/Library/Caches/<bundle-id>)
    let caches = library.join("Caches");
    if let Ok(entries) = fs::read_dir(&caches) {
        for entry in entries.flatten() {
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if is_third_party_bundle_id(&name) && !installed.contains(&name) {
                let (size, mtime) = path_size_and_mtime(&p);
                leftovers.push(GhostLeftover {
                    id: format!("cache_{name}"),
                    name: name.clone(),
                    bundle_id: Some(name),
                    path: p.to_string_lossy().to_string(),
                    size_bytes: size,
                    modified_at: mtime,
                    kind: GhostKind::Cache,
                    is_safe: true,
                });
            }
        }
    }

    // 2. Preferences (~/Library/Preferences/<bundle-id>.plist)
    let prefs = library.join("Preferences");
    if let Ok(entries) = fs::read_dir(&prefs) {
        for entry in entries.flatten() {
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if let Some(bid) = name.strip_suffix(".plist") {
                if is_third_party_bundle_id(bid) && !installed.contains(bid) {
                    let (size, mtime) = path_size_and_mtime(&p);
                    leftovers.push(GhostLeftover {
                        id: format!("pref_{bid}"),
                        name: name.clone(),
                        bundle_id: Some(bid.to_string()),
                        path: p.to_string_lossy().to_string(),
                        size_bytes: size,
                        modified_at: mtime,
                        kind: GhostKind::Preference,
                        is_safe: true,
                    });
                }
            }
        }
    }

    // 3. Saved Application State (~/Library/Saved Application State/<bundle-id>.savedState)
    let saved_state = library.join("Saved Application State");
    if let Ok(entries) = fs::read_dir(&saved_state) {
        for entry in entries.flatten() {
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if let Some(bid) = name.strip_suffix(".savedState") {
                if is_third_party_bundle_id(bid) && !installed.contains(bid) {
                    let (size, mtime) = path_size_and_mtime(&p);
                    leftovers.push(GhostLeftover {
                        id: format!("saved_{bid}"),
                        name: name.clone(),
                        bundle_id: Some(bid.to_string()),
                        path: p.to_string_lossy().to_string(),
                        size_bytes: size,
                        modified_at: mtime,
                        kind: GhostKind::SavedState,
                        is_safe: true,
                    });
                }
            }
        }
    }

    // 4. HTTPStorages (~/Library/HTTPStorages/<bundle-id>)
    let http = library.join("HTTPStorages");
    if let Ok(entries) = fs::read_dir(&http) {
        for entry in entries.flatten() {
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let clean = name.strip_suffix(".binarycookies").unwrap_or(&name);
            if is_third_party_bundle_id(clean) && !installed.contains(clean) {
                let (size, mtime) = path_size_and_mtime(&p);
                leftovers.push(GhostLeftover {
                    id: format!("http_{name}"),
                    name: name.clone(),
                    bundle_id: Some(clean.to_string()),
                    path: p.to_string_lossy().to_string(),
                    size_bytes: size,
                    modified_at: mtime,
                    kind: GhostKind::HttpStorage,
                    is_safe: true,
                });
            }
        }
    }

    // 5. Dead LaunchAgents (~/Library/LaunchAgents/*.plist whose Program no longer exists)
    let agents = library.join("LaunchAgents");
    if let Ok(entries) = fs::read_dir(&agents) {
        for entry in entries.flatten() {
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".plist") {
                if let Ok(content) = fs::read_to_string(&p) {
                    if let Some(target_bin) = parse_launch_agent_target(&content) {
                        let target_path = PathBuf::from(&target_bin);
                        if !target_path.exists() {
                            let (size, mtime) = path_size_and_mtime(&p);
                            leftovers.push(GhostLeftover {
                                id: format!("agent_{name}"),
                                name: format!("{name} (dead: {target_bin})"),
                                bundle_id: None,
                                path: p.to_string_lossy().to_string(),
                                size_bytes: size,
                                modified_at: mtime,
                                kind: GhostKind::LaunchAgent,
                                is_safe: true,
                            });
                        }
                    }
                }
            }
        }
    }

    // 6. Possible leftovers in Application Support (report-first, NEVER safe-to-delete auto)
    let app_support = library.join("Application Support");
    if let Ok(entries) = fs::read_dir(&app_support) {
        for entry in entries.flatten() {
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            // If the folder is named after a third-party reverse-DNS or cask name that is uninstalled
            if is_third_party_bundle_id(&name) && !installed.contains(&name) {
                let (size, mtime) = path_size_and_mtime(&p);
                leftovers.push(GhostLeftover {
                    id: format!("appsupport_{name}"),
                    name: format!("{name} (Application Support)"),
                    bundle_id: Some(name.clone()),
                    path: p.to_string_lossy().to_string(),
                    size_bytes: size,
                    modified_at: mtime,
                    kind: GhostKind::PossibleAppSupport,
                    is_safe: false, // strictly reveal-only per spec!
                });
            }
        }
    }

    let total_reclaimable_bytes = leftovers
        .iter()
        .filter(|l| l.is_safe)
        .map(|l| l.size_bytes)
        .sum();

    let scan_time_epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());

    GhostScanReport {
        leftovers,
        total_reclaimable_bytes,
        scan_time_epoch,
    }
}

pub fn parse_launch_agent_target(content: &str) -> Option<String> {
    // 1. Program
    if let Some(idx) = content.find("<key>Program</key>") {
        let sub = &content[idx..];
        if let Some(start) = sub.find("<string>") {
            let val_start = start + "<string>".len();
            if let Some(end) = sub[val_start..].find("</string>") {
                let target = sub[val_start..val_start + end].trim().to_string();
                if !target.is_empty() {
                    return Some(target);
                }
            }
        }
    }

    // 2. ProgramArguments[0]
    if let Some(idx) = content.find("<key>ProgramArguments</key>") {
        let sub = &content[idx..];
        if let Some(start) = sub.find("<string>") {
            let val_start = start + "<string>".len();
            if let Some(end) = sub[val_start..].find("</string>") {
                let target = sub[val_start..val_start + end].trim().to_string();
                if !target.is_empty() {
                    return Some(target);
                }
            }
        }
    }

    None
}

/// Safely cleans selected ghost leftovers by moving them to .Trash.
/// Dead LaunchAgents are unloaded from launchctl first.
pub fn clean_ghost_leftovers(
    home: &Path,
    ids: &[String],
    all_leftovers: &[GhostLeftover],
) -> Result<u64, String> {
    let mut freed = 0;
    let selected: Vec<&GhostLeftover> = all_leftovers
        .iter()
        .filter(|item| ids.iter().any(|id| id == &item.id))
        .collect();

    for item in selected {
        if !item.is_safe {
            continue; // Safety gate: never auto-delete possible Application Support
        }
        let path = PathBuf::from(&item.path);
        if !path.exists() {
            continue;
        }

        if item.kind == GhostKind::LaunchAgent {
            // Attempt to bootout / unload from launchctl before trashing
            let _ = Command::new("launchctl")
                .args(["unload", &item.path])
                .status();
        }

        move_to_trash(&path, home)?;
        freed += item.size_bytes;
    }

    Ok(freed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_third_party_bundle_id() {
        assert!(is_third_party_bundle_id("com.spotify.client"));
        assert!(is_third_party_bundle_id("com.google.Chrome.plist"));
        assert!(is_third_party_bundle_id("org.videolan.vlc.savedState"));
        assert!(!is_third_party_bundle_id("com.apple.Safari"));
        assert!(!is_third_party_bundle_id("com.apple.Finder.plist"));
        assert!(!is_third_party_bundle_id("plain_name"));
    }

    #[test]
    fn test_parse_launch_agent_target() {
        let plist_program = r#"
        <dict>
            <key>Label</key><string>test</string>
            <key>Program</key><string>/usr/local/bin/nonexistent_bin</string>
        </dict>
        "#;
        assert_eq!(
            parse_launch_agent_target(plist_program).as_deref(),
            Some("/usr/local/bin/nonexistent_bin")
        );

        let plist_args = r#"
        <dict>
            <key>Label</key><string>test</string>
            <key>ProgramArguments</key>
            <array>
                <string>/opt/homebrew/bin/orphan_daemon</string>
                <string>--flag</string>
            </array>
        </dict>
        "#;
        assert_eq!(
            parse_launch_agent_target(plist_args).as_deref(),
            Some("/opt/homebrew/bin/orphan_daemon")
        );
    }
}
