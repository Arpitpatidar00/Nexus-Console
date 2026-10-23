// Projects: every project under the user's project roots, with the build
// output and dependency folders its own tools recreate (node_modules, .next,
// target, Pods, .venv…), how big they are and when the project was last
// touched. Read-only; deletion re-checks every path against the latest report
// (commands::maclean::maclean_clean_projects).

use super::clean;
use super::measure;
use super::store::Rules;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::time::SystemTime;

/// A stack is recognised by a marker file; these folders next to it are its
/// rebuildable output, with what rebuilds them.
struct Stack {
    name: &'static str,
    markers: &'static [&'static str],
    artifacts: &'static [(&'static str, &'static str)],
}

const STACKS: &[Stack] = &[
    Stack {
        name: "Node",
        markers: &["package.json"],
        artifacts: &[
            ("node_modules", "npm install"),
            (".next", "next build / next dev"),
            (".nuxt", "nuxt build"),
            (".turbo", "turbo run build"),
            (".svelte-kit", "vite build"),
            (".parcel-cache", "parcel build"),
            (".angular", "ng build"),
            (".expo", "expo start"),
        ],
    },
    Stack {
        name: "Rust",
        markers: &["Cargo.toml"],
        artifacts: &[("target", "cargo build")],
    },
    Stack {
        name: "Flutter",
        markers: &["pubspec.yaml"],
        artifacts: &[
            ("build", "flutter build"),
            (".dart_tool", "flutter pub get"),
        ],
    },
    Stack {
        name: "Gradle",
        markers: &[
            "build.gradle",
            "build.gradle.kts",
            "settings.gradle",
            "settings.gradle.kts",
        ],
        artifacts: &[("build", "gradle build"), (".gradle", "gradle build")],
    },
    Stack {
        name: "CocoaPods",
        markers: &["Podfile"],
        artifacts: &[("Pods", "pod install")],
    },
    Stack {
        name: "Python",
        markers: &["pyproject.toml", "requirements.txt", "setup.py", "Pipfile"],
        artifacts: &[
            (".venv", "python -m venv .venv + pip install"),
            ("venv", "python -m venv venv + pip install"),
            (".pytest_cache", "pytest"),
            (".mypy_cache", "mypy"),
            (".ruff_cache", "ruff"),
            (".tox", "tox"),
        ],
    },
];

/// Never descended into while looking for projects: artifacts, VCS, and
/// folders that hold other people's code or OS data.
const SKIP: &[&str] = &[
    ".git",
    ".hg",
    ".svn",
    "node_modules",
    "Library",
    ".Trash",
    "Pods",
    ".venv",
    "venv",
    "target",
    ".next",
    ".nuxt",
    ".turbo",
    ".gradle",
    ".dart_tool",
    ".cache",
    "vendor",
];

const MAX_DEPTH: usize = 7;
/// Files read when dating a project: enough to find recent work, bounded.
const ACTIVITY_SAMPLE: usize = 4_000;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    pub name: String,
    /// Absolute: the clean command matches it exactly against this report.
    pub path: String,
    pub bytes: u64,
    /// How the project gets it back.
    pub rebuild: String,
    /// Why it can't be deleted (outside home, a protected name…), if so.
    pub blocked: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub name: String,
    pub path: String,
    /// `~/Desktop/app` for display.
    pub display: String,
    pub stacks: Vec<String>,
    /// Newest change to the project's own files (artifacts and .git excluded).
    pub last_active_epoch: u64,
    pub git: bool,
    /// The protection rule that covers it, if one does.
    pub protected_by: Option<String>,
    pub artifacts: Vec<Artifact>,
    pub bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectsReport {
    pub scanned_at: u64,
    pub roots: Vec<String>,
    pub projects: Vec<Project>,
    pub total_bytes: u64,
    /// Held back by protection rules: shown, never deleted.
    pub protected_bytes: u64,
}

fn epoch(t: SystemTime) -> u64 {
    t.duration_since(SystemTime::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

/// Directories that look like projects, outermost first. A project's own
/// subfolders are searched too: monorepo packages and `android/` are projects.
fn find_projects(roots: &[PathBuf]) -> Vec<(PathBuf, Vec<&'static Stack>)> {
    fn go(dir: &Path, depth: usize, out: &mut Vec<(PathBuf, Vec<&'static Stack>)>) {
        if depth > MAX_DEPTH {
            return;
        }
        let stacks: Vec<&Stack> = STACKS
            .iter()
            .filter(|s| s.markers.iter().any(|m| dir.join(m).is_file()))
            .collect();
        let artifact_names: Vec<&str> = stacks
            .iter()
            .flat_map(|s| s.artifacts.iter().map(|a| a.0))
            .collect();
        if !stacks.is_empty() {
            out.push((dir.to_path_buf(), stacks));
        }
        let Ok(rd) = std::fs::read_dir(dir) else {
            return;
        };
        let mut subs: Vec<PathBuf> = rd
            .flatten()
            .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()))
            .filter(|e| {
                let n = e.file_name().to_string_lossy().into_owned();
                !SKIP.contains(&n.as_str())
                    && !artifact_names.contains(&n.as_str())
                    && !n.ends_with(".app")
            })
            .map(|e| e.path())
            .collect();
        subs.sort();
        for s in subs {
            go(&s, depth + 1, out);
        }
    }
    let mut out = Vec::new();
    for r in roots {
        go(r, 0, &mut out);
    }
    out
}

/// When the project's own files last changed: a bounded walk that skips its
/// artifacts and .git, plus git's index (touched by commits and checkouts).
pub fn last_active(dir: &Path, skip: &[&str]) -> u64 {
    let mut newest = std::fs::metadata(dir.join(".git/index"))
        .and_then(|m| m.modified())
        .map_or(0, epoch);
    let mut seen = 0usize;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&d) else {
            continue;
        };
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().into_owned();
            if SKIP.contains(&n.as_str()) || skip.contains(&n.as_str()) {
                continue;
            }
            let Ok(m) = e.metadata() else { continue };
            if m.is_dir() {
                stack.push(e.path());
            } else {
                newest = newest.max(m.modified().map_or(0, epoch));
                seen += 1;
                if seen >= ACTIVITY_SAMPLE {
                    return newest;
                }
            }
        }
    }
    newest
}

fn tilde(p: &Path, home: &Path) -> String {
    p.strip_prefix(home)
        .map(|r| format!("~/{}", r.display()))
        .unwrap_or_else(|_| p.display().to_string())
}

fn protected_by(p: &Path, rules: &Rules) -> Option<String> {
    let s = p.to_string_lossy();
    rules
        .protected_names
        .iter()
        .find(|n| !n.is_empty() && s.contains(n.as_str()))
        .cloned()
}

/// Measure every project's artifacts, eight `du`s at a time.
pub fn scan(home: &Path, rules: &Rules, cancel: &AtomicBool) -> Option<ProjectsReport> {
    let roots = rules.roots(home);
    let found = find_projects(&roots);
    let mut projects: Vec<Project> = found
        .iter()
        .map(|(dir, stacks)| {
            let names: Vec<&str> = stacks
                .iter()
                .flat_map(|s| s.artifacts.iter().map(|a| a.0))
                .collect();
            let mut artifacts: Vec<Artifact> = Vec::new();
            for s in stacks {
                for (name, rebuild) in s.artifacts {
                    let p = dir.join(name);
                    // A symlinked artifact is someone else's folder: leave it.
                    let real_dir = std::fs::symlink_metadata(&p).is_ok_and(|m| m.is_dir());
                    if real_dir && !artifacts.iter().any(|a| a.name == *name) {
                        artifacts.push(Artifact {
                            name: (*name).into(),
                            path: p.to_string_lossy().into_owned(),
                            bytes: 0,
                            rebuild: (*rebuild).into(),
                            blocked: clean::refuse_reason(&p, home, rules).map(str::to_string),
                        });
                    }
                }
            }
            Project {
                name: dir
                    .file_name()
                    .map_or_else(|| "project".into(), |n| n.to_string_lossy().into_owned()),
                path: dir.to_string_lossy().into_owned(),
                display: tilde(dir, home),
                stacks: stacks.iter().map(|s| s.name.to_string()).collect(),
                last_active_epoch: last_active(dir, &names),
                git: dir.join(".git").exists(),
                protected_by: protected_by(dir, rules),
                artifacts,
                bytes: 0,
            }
        })
        .filter(|p| !p.artifacts.is_empty())
        .collect();

    let jobs: Vec<(usize, usize)> = projects
        .iter()
        .enumerate()
        .flat_map(|(i, p)| (0..p.artifacts.len()).map(move |j| (i, j)))
        .collect();
    let sizes: Vec<Option<u64>> = std::thread::scope(|s| {
        let chunks: Vec<_> = jobs
            .chunks(jobs.len().div_ceil(8).max(1))
            .map(|chunk| {
                let projects = &projects;
                s.spawn(move || {
                    chunk
                        .iter()
                        .map(|&(i, j)| {
                            let p = PathBuf::from(&projects[i].artifacts[j].path);
                            measure::du(&[p.as_path()], &[], cancel)
                        })
                        .collect::<Vec<_>>()
                })
            })
            .collect();
        chunks
            .into_iter()
            .flat_map(|h| h.join().unwrap_or_default())
            .collect()
    });
    if sizes.iter().any(Option::is_none) && cancel.load(std::sync::atomic::Ordering::Relaxed) {
        return None;
    }
    for (&(i, j), b) in jobs.iter().zip(sizes) {
        projects[i].artifacts[j].bytes = b.unwrap_or(0);
    }
    for p in &mut projects {
        p.artifacts.sort_by_key(|a| std::cmp::Reverse(a.bytes));
        p.bytes = p.artifacts.iter().map(|a| a.bytes).sum();
    }
    projects.retain(|p| p.bytes > 0);
    projects.sort_by_key(|p| std::cmp::Reverse(p.bytes));
    let protected_bytes = projects
        .iter()
        .filter(|p| p.protected_by.is_some())
        .map(|p| p.bytes)
        .sum();
    Some(ProjectsReport {
        scanned_at: epoch(SystemTime::now()),
        roots: roots.iter().map(|r| tilde(r, home)).collect(),
        total_bytes: projects.iter().map(|p| p.bytes).sum(),
        protected_bytes,
        projects,
    })
}

/// The artifacts a clean may delete: each must be in `report`, unprotected,
/// and still pass `refuse_reason`. Anything else is an error, not a skip —
/// the frontend only ever sends what the report showed.
pub fn resolve_selection<'a>(
    report: &'a ProjectsReport,
    paths: &[String],
    home: &Path,
    rules: &Rules,
) -> Result<Vec<(&'a Project, &'a Artifact)>, String> {
    let mut out = Vec::new();
    for want in paths {
        let hit = report
            .projects
            .iter()
            .find_map(|p| p.artifacts.iter().find(|a| &a.path == want).map(|a| (p, a)));
        let Some((p, a)) = hit else {
            return Err(format!(
                "{want} isn't in the latest Projects scan. Rescan and try again."
            ));
        };
        if let Some(rule) = &p.protected_by {
            return Err(format!("{} is protected by your rule “{rule}”.", p.display));
        }
        if let Some(why) = clean::refuse_reason(Path::new(&a.path), home, rules) {
            return Err(format!("{}: {why}", a.path));
        }
        out.push((p, a));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::AtomicBool;

    fn home(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("sr-projects-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(d.join("Desktop")).unwrap();
        d
    }

    fn touch(p: &Path, bytes: usize) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, vec![b'x'; bytes]).unwrap();
    }

    fn rules() -> Rules {
        Rules {
            protected_names: vec!["Client-Secret".into()],
            project_roots: vec!["~/Desktop".into()],
            next_idle_days: 7,
            log_age_days: 7,
            stale_node_modules_days: 60,
        }
    }

    #[test]
    fn finds_stacks_artifacts_and_nested_projects() {
        let h = home("find");
        let d = h.join("Desktop");
        touch(&d.join("web/package.json"), 10);
        touch(&d.join("web/node_modules/react/index.js"), 50_000);
        touch(&d.join("web/.next/cache/x"), 20_000);
        touch(&d.join("web/src/app.tsx"), 10);
        // A monorepo package and a nested Rust crate are their own projects.
        touch(&d.join("web/packages/ui/package.json"), 10);
        touch(&d.join("web/packages/ui/node_modules/x.js"), 8_000);
        touch(&d.join("tool/Cargo.toml"), 10);
        touch(&d.join("tool/target/debug/tool"), 200_000);
        // Not a project: no marker, so its `build` is left alone.
        touch(&d.join("notes/build/out.txt"), 9_000);
        // Protected by name: reported, never deletable.
        touch(&d.join("Client-Secret/package.json"), 10);
        touch(&d.join("Client-Secret/node_modules/a.js"), 30_000);
        // node_modules inside node_modules is never searched.
        touch(&d.join("web/node_modules/pkg/package.json"), 10);

        let r = scan(&h, &rules(), &AtomicBool::new(false)).unwrap();
        let names: Vec<&str> = r.projects.iter().map(|p| p.display.as_str()).collect();
        assert_eq!(
            names,
            [
                "~/Desktop/tool",
                "~/Desktop/web",
                "~/Desktop/Client-Secret",
                "~/Desktop/web/packages/ui"
            ]
        );
        let web = r.projects.iter().find(|p| p.name == "web").unwrap();
        assert_eq!(web.stacks, ["Node"]);
        assert_eq!(
            web.artifacts
                .iter()
                .map(|a| a.name.as_str())
                .collect::<Vec<_>>(),
            ["node_modules", ".next"]
        );
        assert_eq!(web.artifacts[0].rebuild, "npm install");
        assert!(web.last_active_epoch > 0);
        let secret = r
            .projects
            .iter()
            .find(|p| p.name == "Client-Secret")
            .unwrap();
        assert_eq!(secret.protected_by.as_deref(), Some("Client-Secret"));
        assert_eq!(r.protected_bytes, secret.bytes);
        assert!(r.total_bytes >= r.protected_bytes + web.bytes);

        // Only listed, unprotected artifacts resolve.
        let rules = rules();
        let ok = resolve_selection(&r, &[web.artifacts[0].path.clone()], &h, &rules).unwrap();
        assert_eq!(ok[0].1.name, "node_modules");
        assert!(
            resolve_selection(&r, &[secret.artifacts[0].path.clone()], &h, &rules)
                .unwrap_err()
                .contains("protected")
        );
        let stray = d.join("notes/build").to_string_lossy().into_owned();
        assert!(resolve_selection(&r, &[stray], &h, &rules)
            .unwrap_err()
            .contains("isn't in the latest"));
        let _ = fs::remove_dir_all(&h);
    }

    /// The wire format `src/features/maclean/api/storage.contracts.test.ts`
    /// parses. Regenerate with `UPDATE_GOLDEN=1 cargo test golden`.
    #[test]
    fn storage_contracts_golden() {
        use crate::services::maclean::appdata::{AppDataReport, AppSpot, SpotChild, SpotKind};
        let projects = ProjectsReport {
            scanned_at: 1_792_800_000,
            roots: vec!["~/Desktop".into()],
            total_bytes: 900,
            protected_bytes: 300,
            projects: vec![
                Project {
                    name: "web".into(),
                    path: "/Users/me/Desktop/web".into(),
                    display: "~/Desktop/web".into(),
                    stacks: vec!["Node".into()],
                    last_active_epoch: 1_792_000_000,
                    git: true,
                    protected_by: None,
                    bytes: 600,
                    artifacts: vec![Artifact {
                        name: "node_modules".into(),
                        path: "/Users/me/Desktop/web/node_modules".into(),
                        bytes: 600,
                        rebuild: "npm install".into(),
                        blocked: None,
                    }],
                },
                Project {
                    name: "client".into(),
                    path: "/Users/me/Desktop/Acme/client".into(),
                    display: "~/Desktop/Acme/client".into(),
                    stacks: vec!["Node".into()],
                    last_active_epoch: 1_792_700_000,
                    git: false,
                    protected_by: Some("Acme".into()),
                    bytes: 300,
                    artifacts: vec![Artifact {
                        name: ".next".into(),
                        path: "/Users/me/Desktop/Acme/client/.next".into(),
                        bytes: 300,
                        rebuild: "next build / next dev".into(),
                        blocked: Some("protected".into()),
                    }],
                },
            ],
        };
        let appdata = AppDataReport {
            scanned_at: 1_792_800_000,
            cleanable_bytes: 700,
            spots: vec![
                AppSpot {
                    id: "gemini_backups".into(),
                    app: "Gemini".into(),
                    label: "Gemini agent task backups".into(),
                    note: "Copies of your files.".into(),
                    kind: SpotKind::AgentBackup,
                    bytes: 500,
                    paths: vec!["~/.gemini/tasks".into()],
                    running: false,
                    children: vec![SpotChild {
                        path: "/Users/me/.gemini/tasks/c_1/backup".into(),
                        label: "Task c_1".into(),
                        bytes: 500,
                        modified_epoch: 1_792_700_000,
                    }],
                },
                AppSpot {
                    id: "slack_cache".into(),
                    app: "Slack".into(),
                    label: "Slack caches".into(),
                    note: "Quit Slack first.".into(),
                    kind: SpotKind::Cache,
                    bytes: 200,
                    paths: vec!["~/Library/Application Support/Slack/Cache".into()],
                    running: true,
                    children: vec![],
                },
            ],
        };
        let json = serde_json::to_string_pretty(
            &serde_json::json!({ "projects": projects, "appData": appdata }),
        )
        .unwrap()
            + "\n";
        let path = format!(
            "{}/../fixtures/maclean/storage-contracts.json",
            env!("CARGO_MANIFEST_DIR")
        );
        if std::env::var_os("UPDATE_GOLDEN").is_some() {
            std::fs::write(&path, &json).unwrap();
        }
        let golden = std::fs::read_to_string(&path).unwrap_or_default();
        assert_eq!(
            json, golden,
            "storage JSON changed; rerun with UPDATE_GOLDEN=1"
        );
    }

    #[test]
    fn activity_ignores_artifacts() {
        let h = home("activity");
        let p = h.join("Desktop/app");
        touch(&p.join("package.json"), 1);
        touch(&p.join("node_modules/x.js"), 1);
        let old = SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1_600_000_000);
        for f in ["package.json", "node_modules/x.js"] {
            fs::File::options()
                .write(true)
                .open(p.join(f))
                .unwrap()
                .set_modified(old)
                .unwrap();
        }
        // node_modules is newer on disk, but only package.json counts.
        fs::File::options()
            .write(true)
            .open(p.join("node_modules/x.js"))
            .unwrap()
            .set_modified(SystemTime::now())
            .unwrap();
        assert_eq!(last_active(&p, &["node_modules"]), 1_600_000_000);
        let _ = fs::remove_dir_all(&h);
    }
}
