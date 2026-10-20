// "Go deeper" helpers for the Storage tab (docs/maclean/PLAN.md §3.2, §3.6):
// drill into a map row, find very large files, size iPhone backups, and find
// unavailable iOS simulators. All read-only. The frontend names a map row by
// id; Rust picks the folders.

use super::measure::du;
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

const GIB: u64 = 1024 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Child {
    pub name: String,
    pub bytes: u64,
}

/// The folders behind a drillable map row, and `-I` masks to keep out.
pub fn drill_roots(
    id: &str,
    home: &Path,
    brew_prefix: Option<&str>,
) -> Option<(Vec<PathBuf>, &'static [&'static str])> {
    let h = |r: &str| home.join(r);
    Some(match id {
        "apps" => (vec![PathBuf::from("/Applications")], &[]),
        "desktop" => (vec![h("Desktop")], &[]),
        "downloads" => (vec![h("Downloads")], &[]),
        // Same exclusion as the map row: other apps' containers prompt.
        "library" => (vec![h("Library")], &["Containers", "Group Containers"]),
        "homebrew" => (vec![PathBuf::from(brew_prefix?)], &[]),
        "devtools" => (
            [
                ".npm", ".nvm", ".cache", ".vscode", ".rustup", ".cargo", ".local", ".gemini",
                ".gradle", ".m2",
            ]
            .iter()
            .map(|d| h(d))
            .collect(),
            &[],
        ),
        _ => return None,
    })
}

/// The 10 biggest children of a map row. For a multi-folder row (dev
/// toolchains) each folder is one child.
pub fn drill(
    id: &str,
    home: &Path,
    brew_prefix: Option<&str>,
    cancel: &AtomicBool,
) -> Option<Vec<Child>> {
    let (roots, ignore) = drill_roots(id, home, brew_prefix)?;
    let mut kids: Vec<Child> = Vec::new();
    for root in &roots {
        let entries: Vec<PathBuf> = if roots.len() > 1 {
            vec![root.clone()]
        } else {
            std::fs::read_dir(root)
                .into_iter()
                .flatten()
                .flatten()
                .filter(|e| {
                    let n = e.file_name();
                    !ignore.iter().any(|i| n == *i)
                })
                .map(|e| e.path())
                .collect()
        };
        for p in entries {
            if !p.exists() {
                continue;
            }
            let bytes = du(&[&p], ignore, cancel)?;
            let name = if roots.len() > 1 {
                format!("~/{}", p.file_name()?.to_string_lossy())
            } else {
                p.file_name()?.to_string_lossy().into_owned()
            };
            kids.push(Child { name, bytes });
        }
    }
    kids.sort_by_key(|c| std::cmp::Reverse(c.bytes));
    kids.truncate(10);
    Some(kids)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LargeFile {
    /// Absolute: the only kind of path "Reveal in Finder" accepts, and only
    /// when it's in the latest report.
    pub path: String,
    pub bytes: u64,
}

/// Files of 1 GiB or more under Desktop, Documents and Downloads (top 10).
/// Skips app bundles, node_modules, .git and hidden folders.
pub fn large_files(home: &Path, min_bytes: u64) -> Vec<LargeFile> {
    fn go(dir: &Path, depth: usize, min: u64, out: &mut Vec<LargeFile>) {
        if depth > 8 {
            return;
        }
        let Ok(rd) = std::fs::read_dir(dir) else {
            return;
        };
        for e in rd.flatten() {
            let n = e.file_name();
            let n = n.to_string_lossy();
            let Ok(m) = std::fs::symlink_metadata(e.path()) else {
                continue;
            };
            if m.is_dir() {
                if n.starts_with('.')
                    || n == "node_modules"
                    || n.ends_with(".app")
                    || n == "Library"
                {
                    continue;
                }
                go(&e.path(), depth + 1, min, out);
            } else if m.is_file() && m.len() >= min {
                out.push(LargeFile {
                    path: e.path().to_string_lossy().into_owned(),
                    bytes: m.len(),
                });
            }
        }
    }
    let mut out = Vec::new();
    for d in ["Desktop", "Documents", "Downloads"] {
        go(&home.join(d), 0, min_bytes, &mut out);
    }
    out.sort_by_key(|f| std::cmp::Reverse(f.bytes));
    out.truncate(10);
    out
}

pub const LARGE_FILE_MIN: u64 = GIB;

/// iPhone/iPad backups. `None` when unreadable (needs Full Disk Access) or absent.
pub fn ios_backups(home: &Path, cancel: &AtomicBool) -> Option<u64> {
    let p = home.join("Library/Application Support/MobileSync/Backup");
    std::fs::read_dir(&p).ok()?;
    du(&[&p], &[], cancel)
}

/// `xcrun simctl list devices unavailable -j` → device folders of simulators
/// whose runtime is gone.
pub fn parse_unavailable_simulators(json: &str) -> Vec<PathBuf> {
    let Ok(v) = serde_json::from_str::<Value>(json) else {
        return vec![];
    };
    v["devices"]
        .as_object()
        .into_iter()
        .flat_map(|m| m.values())
        .flat_map(|list| list.as_array().into_iter().flatten())
        .filter(|d| d["isAvailable"] == false)
        .filter_map(|d| {
            Path::new(d["dataPath"].as_str()?)
                .parent()
                .map(Path::to_path_buf)
        })
        .collect()
}

/// Only with Xcode installed: on a Mac without it, `xcrun` pops the
/// "install developer tools" dialog, which a scan must never do.
pub fn xcode_installed() -> bool {
    Path::new("/Applications/Xcode.app").exists()
}

pub fn unavailable_simulators() -> Vec<PathBuf> {
    if !xcode_installed() {
        return vec![];
    }
    super::tools::output(
        Path::new("/usr/bin/xcrun"),
        &["simctl", "list", "devices", "unavailable", "-j"],
        std::time::Duration::from_secs(30),
    )
    .map(|o| parse_unavailable_simulators(&o))
    .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("maclean-explore-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn drill_only_known_rows() {
        let home = Path::new("/Users/me");
        assert!(drill_roots("library", home, None)
            .unwrap()
            .1
            .contains(&"Containers"));
        assert!(
            drill_roots("homebrew", home, None).is_none(),
            "needs a brew prefix"
        );
        assert!(
            drill_roots("other", home, None).is_none(),
            "computed rows can't be drilled"
        );
        assert!(drill_roots("../etc", home, None).is_none());
    }

    #[test]
    fn drill_lists_biggest_children() {
        let h = tmp("drill");
        std::fs::create_dir_all(h.join("Downloads/big")).unwrap();
        std::fs::create_dir_all(h.join("Downloads/small")).unwrap();
        std::fs::write(h.join("Downloads/big/f"), vec![1u8; 400_000]).unwrap();
        std::fs::write(h.join("Downloads/small/f"), vec![1u8; 10_000]).unwrap();
        let kids = drill("downloads", &h, None, &AtomicBool::new(false)).unwrap();
        assert_eq!(kids[0].name, "big");
        assert_eq!(kids.len(), 2);
    }

    #[test]
    fn large_files_skip_bundles_hidden_and_node_modules() {
        let h = tmp("large");
        for (p, n) in [
            ("Downloads/movie.mov", 3000),
            ("Downloads/small.zip", 10),
            ("Desktop/proj/node_modules/blob", 5000),
            ("Desktop/.cache/blob", 5000),
            ("Desktop/Thing.app/blob", 5000),
            ("Documents/deep/a/b/c/disk.iso", 4000),
        ] {
            let f = h.join(p);
            std::fs::create_dir_all(f.parent().unwrap()).unwrap();
            std::fs::write(&f, vec![0u8; n]).unwrap();
        }
        let found = large_files(&h, 1000);
        let names: Vec<_> = found
            .iter()
            .map(|f| {
                Path::new(&f.path)
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        assert_eq!(names, ["disk.iso", "movie.mov"]);
    }

    #[test]
    fn unavailable_simulator_folders() {
        // simctl's JSON shape (`list devices unavailable -j`).
        let json = r#"{"devices":{"com.apple.CoreSimulator.SimRuntime.iOS-16-0":[
            {"dataPath":"/Users/me/Library/Developer/CoreSimulator/Devices/AAA/data","isAvailable":false,"udid":"AAA","name":"iPhone 14"},
            {"dataPath":"/Users/me/Library/Developer/CoreSimulator/Devices/BBB/data","isAvailable":true,"udid":"BBB","name":"iPhone 15"}]}}"#;
        assert_eq!(
            parse_unavailable_simulators(json),
            [PathBuf::from(
                "/Users/me/Library/Developer/CoreSimulator/Devices/AAA"
            )]
        );
        assert!(parse_unavailable_simulators("nope").is_empty());
    }
}

#[cfg(test)]
mod real_mac {
    use super::*;

    // cargo test real_explore -- --ignored --nocapture (read-only, this Mac)
    #[test]
    #[ignore]
    fn real_explore_on_this_mac() {
        let home = crate::doctor::paths::home().unwrap();
        let t = std::time::Instant::now();
        for k in drill("library", &home, None, &AtomicBool::new(false)).unwrap() {
            println!(
                "  library/{:<40} {:>7.2} GB",
                k.name,
                k.bytes as f64 / GIB as f64
            );
        }
        println!("drill {:?}", t.elapsed());
        let t = std::time::Instant::now();
        let big = large_files(&home, LARGE_FILE_MIN);
        println!("large files {} in {:?}", big.len(), t.elapsed());
        println!(
            "xcode {} · backups {:?}",
            xcode_installed(),
            ios_backups(&home, &AtomicBool::new(false))
        );
    }
}
