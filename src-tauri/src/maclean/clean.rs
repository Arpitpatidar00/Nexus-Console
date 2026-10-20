// The only part of Mac Clean that deletes. Every deletion is one of the
// catalog's item ids, re-resolved and re-checked here at clean time (never a
// path from the frontend), and every path goes through `safe_rm`
// (docs/maclean/PLAN.md §2, §7).

use super::catalog::{self, DockerUsage, Env, ITEM_IDS};
use super::measure;
use super::store::Rules;
use super::tools;
use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::path::{Component, Path};
use std::sync::Mutex;

/// Why `safe_rm` refused a path, or `None` if it may go.
pub fn refuse_reason(path: &Path, home: &Path, rules: &Rules) -> Option<&'static str> {
    if !path.is_absolute() || path.components().any(|c| matches!(c, Component::ParentDir)) {
        return Some("not a clean absolute path");
    }
    if path == home || !path.starts_with(home) {
        return Some("outside your home folder");
    }
    let sensitive = path.components().any(|c| {
        let n = c.as_os_str().to_string_lossy();
        n == ".git" || n == ".ssh" || n == "src" || n.starts_with(".env")
    });
    if sensitive {
        return Some("sensitive (.git, .ssh, .env, src)");
    }
    if rules.is_protected(path) {
        return Some("protected");
    }
    // A symlinked parent could point anywhere: the real location must still
    // be inside home.
    let parent = path.parent()?;
    let real_home = home.canonicalize().unwrap_or_else(|_| home.to_path_buf());
    match parent.canonicalize() {
        Ok(real) if real.starts_with(&real_home) => None,
        Ok(_) => Some("resolves outside your home folder"),
        Err(_) => None, // parent gone: nothing to delete anyway
    }
}

/// Delete one path the script's way (`rm -rf`), refusing anything unsafe.
/// A symlink is removed as a link, never followed; `remove_dir_all` doesn't
/// follow links inside the tree either. Missing = nothing to do.
pub fn safe_rm(path: &Path, home: &Path, rules: &Rules) -> Result<(), String> {
    let Ok(meta) = std::fs::symlink_metadata(path) else {
        return Ok(());
    };
    if let Some(why) = refuse_reason(path, home, rules) {
        return Err(format!("refused {}: {why}", path.display()));
    }
    let r = if meta.is_dir() {
        std::fs::remove_dir_all(path)
    } else {
        std::fs::remove_file(path)
    };
    r.map_err(|e| format!("{}: {e}", path.display()))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemResult {
    pub id: String,
    pub label: String,
    pub ok: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanResult {
    pub at_epoch: u64,
    /// Measured with `df` before and after: what the disk actually gained.
    pub freed_bytes: u64,
    pub items: Vec<ItemResult>,
}

/// Only ids from the catalog, deduplicated, in catalog order.
pub fn validate_selection(ids: &[String]) -> AppResult<Vec<&'static str>> {
    for id in ids {
        if !ITEM_IDS.contains(&id.as_str()) {
            return Err(AppError::InvalidName(format!("unknown cleanup item: {id}")));
        }
    }
    let out: Vec<&'static str> = ITEM_IDS
        .into_iter()
        .filter(|i| ids.iter().any(|x| x == i))
        .collect();
    if out.is_empty() {
        return Err(AppError::InvalidName("nothing selected".into()));
    }
    Ok(out)
}

fn run_tool(bin: &Path, args: &[&str]) -> Result<(), String> {
    tools::output(bin, args, std::time::Duration::from_secs(600))
        .map(|_| ())
        .ok_or_else(|| format!("{} {} failed", bin.display(), args.join(" ")))
}

/// Clean one item. Skip rules are re-checked first: an app opened since the
/// scan wins over the user's earlier tick.
pub fn clean_item(
    id: &str,
    env: &Env,
    docker: &DockerUsage,
    brew_lock: &Mutex<()>,
) -> Result<String, String> {
    let brew = catalog::brew_bin(env);
    if let Some(why) = catalog::skip_for(id, env, docker, brew.as_deref()) {
        return Err(format!("skipped: {why}"));
    }
    let rm_all = |paths: &[std::path::PathBuf]| -> Result<String, String> {
        let errs: Vec<String> = paths
            .iter()
            .filter_map(|p| safe_rm(p, &env.home, env.rules).err())
            .collect();
        if errs.is_empty() {
            Ok("cleaned".into())
        } else {
            Err(errs.join("; "))
        }
    };
    match id {
        // pnpm: prune keeps what projects still link to, unlike deleting the store.
        "pnpm" => {
            let bin = tools::find_bin("pnpm", &env.home, env.brew_prefix.as_deref())
                .ok_or("pnpm not found")?;
            run_tool(&bin, &["store", "prune"]).map(|_| "pruned".into())
        }
        _ if catalog::paths_of(id, env).is_some() => {
            rm_all(&catalog::paths_of(id, env).unwrap_or_default())
        }
        "logs" => {
            let mut old = Vec::new();
            let cutoff = env.now
                - std::time::Duration::from_secs(u64::from(env.rules.log_age_days) * 86_400);
            measure::walk(&env.h("Library/Logs"), &mut |p, m| {
                if m.modified().is_ok_and(|t| t < cutoff) {
                    old.push(p.to_path_buf());
                }
            });
            rm_all(&old).map(|_| format!("{} old log files removed", old.len()))
        }
        "next" => {
            let dirs = catalog::idle_next_dirs(env);
            rm_all(&dirs).map(|_| format!("{} .next folders removed", dirs.len()))
        }
        "docker_cache" => {
            let bin = tools::find_bin("docker", &env.home, env.brew_prefix.as_deref())
                .ok_or("docker not found")?;
            run_tool(&bin, &["builder", "prune", "-af"])?;
            // Untagged images only. Tagged unused images are their own item.
            run_tool(&bin, &["image", "prune", "-f"])
                .map(|_| "build cache and untagged images removed".into())
        }
        "docker_images" => {
            let bin = tools::find_bin("docker", &env.home, env.brew_prefix.as_deref())
                .ok_or("docker not found")?;
            // Re-read now: only images that are STILL unused go.
            let fresh = catalog::docker_usage(env);
            if fresh.unused.is_empty() {
                return Ok("nothing unused anymore".into());
            }
            let mut args = vec!["image", "rm"];
            args.extend(fresh.unused.iter().map(|i| i.id.as_str()));
            run_tool(&bin, &args).map(|_| format!("{} images removed", fresh.unused.len()))
        }
        "brew" => {
            let bin = brew.ok_or("Homebrew not installed")?;
            let _g = brew_lock.lock().map_err(|_| "brew lock poisoned")?;
            run_tool(&bin, &["cleanup", "--prune=all"])?;
            run_tool(&bin, &["autoremove"])
                .map(|_| "old versions, cache and unused dependencies removed".into())
        }
        "simulators" => run_tool(
            Path::new("/usr/bin/xcrun"),
            &["simctl", "delete", "unavailable"],
        )
        .map(|_| "unavailable simulators deleted".into()),
        _ => Err(format!("unknown item {id}")),
    }
}

/// Validate rule edits coming from the frontend.
pub fn validate_rules(r: &Rules) -> AppResult<()> {
    let bad = |m: &str| Err(AppError::InvalidName(m.into()));
    if r.protected_names.len() > 20 || r.project_roots.len() > 10 {
        return bad("too many entries");
    }
    for n in &r.protected_names {
        let t = n.trim();
        if t.is_empty() || t.len() > 64 || t.contains('/') || t.chars().any(char::is_control) {
            return bad("protected names are folder names: no slashes, 1–64 characters");
        }
    }
    for root in &r.project_roots {
        let ok = (root.starts_with("~/") || root == "~" || root.starts_with('/'))
            && !root.split('/').any(|s| s == "..")
            && root.len() <= 512
            && !root.chars().any(char::is_control);
        if !ok {
            return bad("project folders must be like ~/Desktop (inside your home)");
        }
    }
    for d in [r.next_idle_days, r.log_age_days, r.stale_node_modules_days] {
        if !(1..=3650).contains(&d) {
            return bad("day limits must be 1–3650");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn home(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("maclean-clean-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d.canonicalize().unwrap()
    }

    #[test]
    fn refuses_everything_the_script_refuses() {
        let h = home("refuse");
        let r = Rules::default();
        let case = |rel: &str| refuse_reason(&h.join(rel), &h, &r);
        assert_eq!(case(".npm/_cacache"), None);
        assert_eq!(case("Library/Caches/Google/Chrome"), None);
        assert!(case("Desktop/app/.git").is_some());
        assert!(case("Desktop/app/.git/objects").is_some());
        assert!(case(".ssh/id_ed25519").is_some());
        assert!(case("Desktop/app/.env.local").is_some());
        assert!(case("Desktop/app/src/.next").is_some());
        assert!(case("Desktop/Fameo/web/.next").is_some(), "protected name");
        assert!(refuse_reason(&h, &h, &r).is_some(), "home itself");
        assert!(refuse_reason(Path::new("/etc/hosts"), &h, &r).is_some());
        assert!(refuse_reason(&h.join("a/../../etc"), &h, &r).is_some());
        assert!(refuse_reason(Path::new("relative/path"), &h, &r).is_some());
    }

    #[test]
    fn symlinks_never_lead_outside_home() {
        let h = home("link");
        let outside = home("link-outside");
        std::fs::write(outside.join("keep.txt"), "x").unwrap();
        let r = Rules::default();

        // A link *inside* a cache dir pointing out: removing the cache removes
        // the link, never the target.
        std::fs::create_dir_all(h.join("cache")).unwrap();
        std::os::unix::fs::symlink(&outside, h.join("cache/escape")).unwrap();
        safe_rm(&h.join("cache"), &h, &r).unwrap();
        assert!(!h.join("cache").exists());
        assert!(outside.join("keep.txt").exists(), "target untouched");

        // A path whose parent is a symlink to outside home is refused.
        std::os::unix::fs::symlink(&outside, h.join("via")).unwrap();
        let err = safe_rm(&h.join("via/keep.txt"), &h, &r).unwrap_err();
        assert!(err.contains("resolves outside"), "{err}");
        assert!(outside.join("keep.txt").exists());

        // The item path itself a symlink: only the link goes.
        std::os::unix::fs::symlink(&outside, h.join("linked-cache")).unwrap();
        safe_rm(&h.join("linked-cache"), &h, &r).unwrap();
        assert!(outside.join("keep.txt").exists());
        assert!(safe_rm(&h.join("missing"), &h, &r).is_ok());
    }

    #[test]
    fn selection_is_whitelisted_and_ordered() {
        let s = validate_selection(&["xcode".into(), "npm".into(), "npm".into()]).unwrap();
        assert_eq!(s, ["npm", "xcode"]);
        assert!(validate_selection(&["../etc".into()]).is_err());
        assert!(validate_selection(&[]).is_err());
    }

    #[test]
    fn path_items_clean_only_their_folders() {
        let h = home("items");
        for p in [
            ".npm/_cacache/x",
            ".npm/_logs/y",
            ".npm/keep/z",
            "Desktop/Fameo/web/.next/a",
            "Desktop/shop/.next/b",
        ] {
            std::fs::create_dir_all(h.join(p)).unwrap();
        }
        let rules = Rules::default();
        let cancel = std::sync::atomic::AtomicBool::new(false);
        // Seen from the future, so the .next folders are idle.
        let env = Env {
            home: h.clone(),
            brew_prefix: None,
            rules: &rules,
            now: std::time::SystemTime::now() + std::time::Duration::from_secs(30 * 86_400),
            cancel: &cancel,
        };
        let lock = Mutex::new(());
        let docker = DockerUsage::default();
        clean_item("npm", &env, &docker, &lock).unwrap();
        assert!(!h.join(".npm/_cacache").exists() && !h.join(".npm/_logs").exists());
        assert!(
            h.join(".npm/keep/z").exists(),
            "only the listed npm folders"
        );
        clean_item("next", &env, &docker, &lock).unwrap();
        assert!(!h.join("Desktop/shop/.next").exists());
        assert!(
            h.join("Desktop/Fameo/web/.next/a").exists(),
            "protected project untouched"
        );
        // Docker without a daemon: skipped, not attempted.
        assert!(clean_item("docker_cache", &env, &docker, &lock)
            .unwrap_err()
            .starts_with("skipped"));
    }

    #[test]
    fn rule_edits_are_validated() {
        assert!(validate_rules(&Rules::default()).is_ok());
        let bad = |f: fn(&mut Rules)| {
            let mut r = Rules::default();
            f(&mut r);
            validate_rules(&r).is_err()
        };
        assert!(bad(|r| r.protected_names = vec!["a/b".into()]));
        assert!(bad(|r| r.protected_names = vec!["  ".into()]));
        assert!(bad(|r| r.project_roots = vec!["~/../etc".into()]));
        assert!(bad(|r| r.project_roots = vec!["Desktop".into()]));
        assert!(bad(|r| r.log_age_days = 0));
    }
}
