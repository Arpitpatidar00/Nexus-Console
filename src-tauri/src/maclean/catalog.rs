// The cleanup catalog: the script's items (plus two improvements), each with
// how it's measured and when it must be skipped. Only regenerable caches,
// logs and build output. Cleaning lands in P2 and reuses `paths_of` here, so
// what is measured is exactly what would be deleted.

use super::measure::{self, du};
use super::store::Rules;
use super::tools;
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::time::{Duration, SystemTime};

const TOOL_TIMEOUT: Duration = Duration::from_secs(30);

pub const ITEM_IDS: [&str; 15] = [
    "npm",
    "pnpm",
    "yarn",
    "pip",
    "chrome",
    "vscode",
    "antigravity",
    "logs",
    "docker_installer",
    "docker_cache",
    "docker_images",
    "brew",
    "next",
    "xcode",
    "simulators",
];

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanItem {
    pub id: &'static str,
    pub label: String,
    pub bytes: u64,
    /// Why it can't be cleaned right now (e.g. "Chrome is open"), or `None`.
    pub skip: Option<String>,
    /// Ticked in the plan by default. Only the unused-images item isn't.
    pub default_selected: bool,
    /// Optional honest line under the label.
    pub note: Option<String>,
    /// What exactly is in it: folders or image names, with sizes.
    pub detail: Vec<String>,
}

/// Everything item measurement needs, resolved once per scan.
pub struct Env<'a> {
    pub home: PathBuf,
    pub brew_prefix: Option<String>,
    pub rules: &'a Rules,
    pub now: SystemTime,
    pub cancel: &'a AtomicBool,
}

impl Env<'_> {
    pub fn h(&self, rel: &str) -> PathBuf {
        self.home.join(rel)
    }

    pub fn tilde(&self, p: &Path) -> String {
        p.strip_prefix(&self.home)
            .map(|r| format!("~/{}", r.display()))
            .unwrap_or_else(|_| p.display().to_string())
    }
}

const VSCODE: &str = "Library/Application Support/Code";
const ANTIGRAVITY: &str = "Library/Application Support/Antigravity IDE";
const EDITOR_CACHES: [&str; 6] = [
    "Cache",
    "CachedData",
    "CachedExtensionVSIXs",
    "Code Cache",
    "GPUCache",
    "logs",
];

/// The fixed directories behind path-based items (None for tool-based ones).
pub fn paths_of(id: &str, env: &Env) -> Option<Vec<PathBuf>> {
    let under =
        |base: &str, subs: &[&str]| subs.iter().map(|s| env.h(&format!("{base}/{s}"))).collect();
    Some(match id {
        "npm" => under(".npm", &["_cacache", "_npx", "_logs"]),
        "pnpm" => vec![env.h("Library/pnpm/store")],
        "yarn" => vec![env.h("Library/Caches/Yarn")],
        "pip" => vec![env.h("Library/Caches/pip")],
        "chrome" => vec![env.h("Library/Caches/Google/Chrome")],
        "vscode" => under(VSCODE, &EDITOR_CACHES),
        "antigravity" => {
            let mut v: Vec<PathBuf> = under(
                ANTIGRAVITY,
                &["Cache", "CachedData", "Code Cache", "GPUCache", "logs"],
            );
            v.push(env.h(".gemini/antigravity/browser_recordings"));
            v
        }
        "docker_installer" => vec![env.h("Library/Application Support/com.docker.install")],
        "xcode" => vec![env.h("Library/Developer/Xcode/DerivedData")],
        _ => return None,
    })
}

fn label_of(id: &str, rules: &Rules) -> String {
    match id {
        "npm" => "npm cache".into(),
        "pnpm" => "pnpm store (unused packages)".into(),
        "yarn" => "Yarn cache".into(),
        "pip" => "pip cache".into(),
        "chrome" => "Chrome cache".into(),
        "vscode" => "VS Code caches & logs".into(),
        "antigravity" => "Antigravity caches".into(),
        "logs" => format!("App logs older than {} days", rules.log_age_days),
        "docker_installer" => "Docker installer leftovers".into(),
        "docker_cache" => "Docker build cache & untagged images".into(),
        "docker_images" => "Unused Docker images".into(),
        "brew" => "Homebrew old versions & cache".into(),
        "next" => "Idle Next.js builds (.next)".into(),
        "xcode" => "Xcode DerivedData".into(),
        "simulators" => "Unavailable iOS simulators".into(),
        _ => id.into(),
    }
}

// --- Docker -----------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerImage {
    pub id: String,
    pub name: String,
    /// What removing it frees: layers no other image shares.
    pub unique_bytes: u64,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct DockerUsage {
    pub installed: bool,
    pub running: bool,
    pub build_cache_reclaimable: u64,
    /// Images + containers + volumes + build cache, as Docker counts them.
    pub used_bytes: u64,
    pub dangling: Vec<DockerImage>,
    pub unused: Vec<DockerImage>,
}

fn bytes(v: &Value) -> u64 {
    v.as_str()
        .and_then(|s| crate::remote::parse::human_bytes(s.split_whitespace().next().unwrap_or("")))
        .unwrap_or(0)
}

/// `docker system df --format '{{json .}}'`: one object per type.
pub fn parse_docker_df(jsonl: &str) -> (u64, u64) {
    let mut cache = 0;
    let mut used = 0;
    for v in jsonl
        .lines()
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
    {
        used += bytes(&v["Size"]);
        if v["Type"] == "Build Cache" {
            cache = bytes(&v["Reclaimable"]);
        }
    }
    (cache, used)
}

/// `docker system df -v`: images with how many containers (running or not)
/// use them. Untagged + unused = dangling (safe); tagged + unused = the
/// user's call (it might be a dev image they'd have to rebuild).
pub fn parse_docker_images(json: &str) -> (Vec<DockerImage>, Vec<DockerImage>) {
    let Ok(v) = serde_json::from_str::<Value>(json) else {
        return (vec![], vec![]);
    };
    let (mut dangling, mut unused) = (vec![], vec![]);
    for img in v["Images"].as_array().into_iter().flatten() {
        if img["Containers"].as_str().unwrap_or("1") != "0" {
            continue;
        }
        let repo = img["Repository"].as_str().unwrap_or("<none>");
        let tag = img["Tag"].as_str().unwrap_or("<none>");
        let d = DockerImage {
            id: img["ID"]
                .as_str()
                .unwrap_or("")
                .trim_start_matches("sha256:")
                .chars()
                .take(12)
                .collect(),
            name: if repo == "<none>" {
                "<untagged>".into()
            } else {
                format!("{repo}:{tag}")
            },
            unique_bytes: bytes(&img["UniqueSize"]),
        };
        if d.id.is_empty() {
            continue;
        }
        if repo == "<none>" {
            dangling.push(d)
        } else {
            unused.push(d)
        }
    }
    unused.sort_by_key(|i| std::cmp::Reverse(i.unique_bytes));
    (dangling, unused)
}

pub fn docker_usage(env: &Env) -> DockerUsage {
    let Some(bin) = tools::find_bin("docker", &env.home, env.brew_prefix.as_deref()) else {
        return DockerUsage::default();
    };
    let mut u = DockerUsage {
        installed: true,
        ..Default::default()
    };
    let Some(df) = tools::output(
        &bin,
        &["system", "df", "--format", "{{json .}}"],
        TOOL_TIMEOUT,
    ) else {
        return u; // installed, daemon not running
    };
    u.running = true;
    (u.build_cache_reclaimable, u.used_bytes) = parse_docker_df(&df);
    if let Some(v) = tools::output(
        &bin,
        &["system", "df", "-v", "--format", "{{json .}}"],
        TOOL_TIMEOUT,
    ) {
        (u.dangling, u.unused) = parse_docker_images(&v);
    }
    u
}

// --- Homebrew ------------------------------------------------------------------

/// `brew cleanup -n`: "==> This operation would free approximately 14.1MB of disk space."
pub fn parse_brew_cleanup(out: &str) -> u64 {
    out.lines()
        .find(|l| l.contains("approximately"))
        .and_then(|l| {
            l.split_whitespace()
                .find(|w| w.ends_with('B') && w.starts_with(|c: char| c.is_ascii_digit()))
        })
        .and_then(crate::remote::parse::human_bytes)
        .unwrap_or(0)
}

// --- project scans ------------------------------------------------------------

/// Directories named `name` under the roots: not descending into
/// node_modules, .git or a match, depth-limited. Protected paths dropped.
pub fn find_dirs(roots: &[PathBuf], name: &str, rules: &Rules, max_depth: usize) -> Vec<PathBuf> {
    fn go(dir: &Path, name: &str, depth: usize, max: usize, out: &mut Vec<PathBuf>) {
        if depth > max {
            return;
        }
        let Ok(rd) = std::fs::read_dir(dir) else {
            return;
        };
        for e in rd.flatten() {
            let Ok(ft) = e.file_type() else { continue };
            if !ft.is_dir() {
                continue;
            }
            let n = e.file_name();
            let p = e.path();
            if n == name {
                out.push(p);
            } else if n != "node_modules" && n != ".git" {
                go(&p, name, depth + 1, max, out);
            }
        }
    }
    let mut out = Vec::new();
    for r in roots {
        go(r, name, 0, max_depth, &mut out);
    }
    out.retain(|p| !rules.is_protected(p));
    out
}

/// `.next` folders whose project hasn't been touched within the idle window.
pub fn idle_next_dirs(env: &Env) -> Vec<PathBuf> {
    find_dirs(&env.rules.roots(&env.home), ".next", env.rules, 8)
        .into_iter()
        .filter(|d| !measure::touched_within(d, env.rules.next_idle_days, env.now))
        .collect()
}

// --- the catalog ----------------------------------------------------------------

pub fn skip_for(
    id: &str,
    env: &Env,
    docker: &DockerUsage,
    brew_bin: Option<&Path>,
) -> Option<String> {
    let open = |app: &str, what: &str| tools::app_running(app).then(|| format!("{what} is open"));
    match id {
        "chrome" => open("Google Chrome", "Chrome"),
        "vscode" => open("Visual Studio Code", "VS Code"),
        "antigravity" => open("Antigravity IDE", "Antigravity"),
        "xcode" => open("Xcode", "Xcode"),
        "simulators" => {
            if !super::explore::xcode_installed() {
                Some("Xcode not installed".into())
            } else {
                open("Xcode", "Xcode")
            }
        }
        "pnpm" => tools::find_bin("pnpm", &env.home, env.brew_prefix.as_deref())
            .is_none()
            .then(|| "pnpm not found".into()),
        "brew" => brew_bin.is_none().then(|| "Homebrew not installed".into()),
        "docker_cache" | "docker_images" => {
            if !docker.installed {
                Some("Docker not installed".into())
            } else if !docker.running {
                Some("Docker isn't running".into())
            } else {
                None
            }
        }
        "docker_installer" => {
            let p = env.h("Library/Application Support/com.docker.install");
            let fresh = std::fs::metadata(&p)
                .and_then(|m| m.modified())
                .is_ok_and(|t| {
                    env.now.duration_since(t).unwrap_or_default() < Duration::from_secs(86_400)
                });
            fresh.then(|| "Docker update may be in progress".into())
        }
        _ => None,
    }
}

pub fn brew_bin(env: &Env) -> Option<PathBuf> {
    env.brew_prefix
        .as_deref()
        .map(|p| Path::new(p).join("bin/brew"))
        .filter(|p| p.is_file())
}

/// Measure one item. `None` = cancelled.
pub fn measure_item(id: &'static str, env: &Env, docker: &DockerUsage) -> Option<CleanItem> {
    let brew_bin = brew_bin(env);
    let mut detail = Vec::new();
    let mut note = None;
    let bytes = if let Some(paths) = paths_of(id, env) {
        let refs: Vec<&Path> = paths.iter().map(PathBuf::as_path).collect();
        du(&refs, &[], env.cancel)?
    } else {
        match id {
            "logs" => {
                measure::old_files_bytes(&env.h("Library/Logs"), env.rules.log_age_days, env.now)
            }
            "docker_cache" => {
                let dangling: u64 = docker.dangling.iter().map(|i| i.unique_bytes).sum();
                docker.build_cache_reclaimable + dangling
            }
            "docker_images" => {
                detail = docker
                    .unused
                    .iter()
                    .map(|i| {
                        format!(
                            "{} · {}",
                            i.name,
                            crate::doctor::vscode::fmt_mb(i.unique_bytes)
                        )
                    })
                    .collect();
                note = Some(
                    "Images no container uses. Tick only the ones you can pull or rebuild.".into(),
                );
                docker.unused.iter().map(|i| i.unique_bytes).sum()
            }
            "brew" => brew_bin
                .as_deref()
                .and_then(|b| tools::output(b, &["cleanup", "-n", "--prune=all"], TOOL_TIMEOUT))
                .map_or(0, |o| parse_brew_cleanup(&o)),
            "next" => {
                let dirs = idle_next_dirs(env);
                let mut total = 0;
                for d in &dirs {
                    let b = du(&[d], &[], env.cancel)?;
                    detail.push(format!(
                        "{} · {}",
                        env.tilde(d),
                        crate::doctor::vscode::fmt_mb(b)
                    ));
                    total += b;
                }
                total
            }
            "simulators" => {
                let mut total = 0;
                for d in super::explore::unavailable_simulators() {
                    let b = du(&[&d], &[], env.cancel)?;
                    detail.push(format!(
                        "{} · {}",
                        env.tilde(&d),
                        crate::doctor::vscode::fmt_mb(b)
                    ));
                    total += b;
                }
                total
            }
            _ => 0,
        }
    };
    if id == "pnpm" {
        note =
            Some("Pruned with `pnpm store prune`: packages your projects still use stay.".into());
    }
    Some(CleanItem {
        id,
        label: label_of(id, env.rules),
        bytes,
        skip: skip_for(id, env, docker, brew_bin.as_deref()),
        default_selected: id != "docker_images",
        note,
        detail,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> String {
        std::fs::read_to_string(format!(
            "{}/../fixtures/maclean/{name}",
            env!("CARGO_MANIFEST_DIR")
        ))
        .unwrap()
    }

    #[test]
    fn docker_summary_and_build_cache() {
        let (cache, used) = parse_docker_df(&fixture("docker-system-df.jsonl"));
        assert_eq!(cache, 12_570_000_000);
        assert!(used > cache);
        assert_eq!(parse_docker_df("not json"), (0, 0));
    }

    #[test]
    fn docker_images_in_use_are_never_offered() {
        let raw = fixture("docker-system-df-v.json");
        let (dangling, unused) = parse_docker_images(&raw);
        assert!(
            dangling.is_empty() && unused.is_empty(),
            "every image here backs a container"
        );

        // The rule itself: flip one tagged image and one to untagged.
        let mut v: Value = serde_json::from_str(&raw).unwrap();
        v["Images"][3]["Containers"] = "0".into();
        v["Images"][0]["Containers"] = "0".into();
        v["Images"][0]["Repository"] = "<none>".into();
        let (dangling, unused) = parse_docker_images(&v.to_string());
        assert_eq!(unused.len(), 1);
        assert_eq!(unused[0].name, "docker:29-dind");
        assert_eq!(unused[0].id, "3e5756e2b6da");
        assert_eq!(unused[0].unique_bytes, 443_900_000);
        assert_eq!(dangling.len(), 1);
        assert_eq!(dangling[0].name, "<untagged>");
    }

    #[test]
    fn brew_cleanup_dry_run_size() {
        assert_eq!(
            parse_brew_cleanup(&fixture("brew-cleanup-dry.txt")),
            14_100_000
        );
        assert_eq!(parse_brew_cleanup("nothing to do"), 0);
    }

    fn tmp_home(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("maclean-cat-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn next_dirs_skip_protected_nested_and_node_modules() {
        let home = tmp_home("next");
        for p in [
            "Desktop/shop/.next/cache",
            "Desktop/Fameo/web/.next",
            "Desktop/shop/node_modules/pkg/.next",
            "Desktop/mono/apps/site/.next",
            "Desktop/shop/.git/.next",
        ] {
            std::fs::create_dir_all(home.join(p)).unwrap();
        }
        let rules = Rules::default();
        let found = find_dirs(&rules.roots(&home), ".next", &rules, 8);
        let mut rel: Vec<String> = found
            .iter()
            .map(|p| p.strip_prefix(&home).unwrap().display().to_string())
            .collect();
        rel.sort();
        assert_eq!(rel, ["Desktop/mono/apps/site/.next", "Desktop/shop/.next"]);
    }

    #[test]
    fn path_items_cover_the_scripts_folders() {
        let rules = Rules::default();
        let cancel = AtomicBool::new(false);
        let env = Env {
            home: PathBuf::from("/Users/me"),
            brew_prefix: None,
            rules: &rules,
            now: SystemTime::now(),
            cancel: &cancel,
        };
        let vs = paths_of("vscode", &env).unwrap();
        assert_eq!(vs.len(), 6);
        assert!(vs.contains(&PathBuf::from(
            "/Users/me/Library/Application Support/Code/Code Cache"
        )));
        assert_eq!(
            paths_of("npm", &env).unwrap(),
            ["_cacache", "_npx", "_logs"].map(|s| PathBuf::from(format!("/Users/me/.npm/{s}")))
        );
        assert!(paths_of("antigravity", &env)
            .unwrap()
            .contains(&PathBuf::from(
                "/Users/me/.gemini/antigravity/browser_recordings"
            )));
        assert!(
            paths_of("docker_cache", &env).is_none(),
            "tool-based items have no paths"
        );
        for id in ITEM_IDS {
            assert!(!label_of(id, &rules).is_empty());
        }
    }
}
