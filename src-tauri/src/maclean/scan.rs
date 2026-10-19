// One storage scan = the script's report sections, as data: disk, where
// storage goes, APFS volumes, root causes, the cleanup plan, and "worth a
// look". Measurements run 4 at a time and report progress; cancel kills the
// running `du`s. Strictly read-only.

use super::catalog::{self, CleanItem, DockerUsage, Env, ITEM_IDS};
use super::disk::{self, DiskStats, LocalSnapshots, Volume};
use super::measure::{self, du};
use super::store::Rules;
use super::tools;
use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{Instant, SystemTime};

const WORKERS: usize = 4;

/// A labelled measurement; `None` = cancelled.
type Job<'a, T> = (String, Box<dyn FnOnce() -> Option<T> + Send + 'a>);
const GB: u64 = 1024 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapEntry {
    pub id: &'static str,
    pub label: String,
    pub bytes: u64,
    pub note: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Cause {
    /// Space it accounts for, when measurable.
    pub bytes: Option<u64>,
    pub text: String,
    /// What the user can do. Never automated.
    pub fix: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Insight {
    pub id: &'static str,
    pub text: String,
    pub detail: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageReport {
    pub scanned_at: u64,
    pub scan_ms: u64,
    pub disk: DiskStats,
    /// Biggest first; includes "macOS volumes" and the unexplained remainder.
    pub map: Vec<MapEntry>,
    pub volumes: Vec<Volume>,
    pub causes: Vec<Cause>,
    pub items: Vec<CleanItem>,
    pub insights: Vec<Insight>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub label: String,
    pub done: usize,
    pub total: usize,
}

/// Run jobs on a few threads, in any order, reporting each as it lands.
/// `None` from any job (cancelled) makes the whole call `None`.
fn par<T: Send>(jobs: Vec<Job<'_, T>>, on_done: &(dyn Fn(&str) + Sync)) -> Option<Vec<T>> {
    let n = jobs.len();
    let queue: Mutex<Vec<(usize, Job<'_, T>)>> =
        Mutex::new(jobs.into_iter().enumerate().rev().collect());
    let results: Mutex<Vec<Option<Option<T>>>> = Mutex::new((0..n).map(|_| None).collect());
    std::thread::scope(|s| {
        for _ in 0..WORKERS.min(n.max(1)) {
            s.spawn(|| loop {
                let Some((i, (label, f))) = queue.lock().ok().and_then(|mut q| q.pop()) else {
                    break;
                };
                let r = f();
                on_done(&label);
                if let Ok(mut res) = results.lock() {
                    res[i] = Some(r);
                }
            });
        }
    });
    results
        .into_inner()
        .ok()?
        .into_iter()
        .map(|r| r.flatten())
        .collect()
}

fn docker_raw(home: &Path) -> PathBuf {
    home.join("Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw")
}

const DEV_TOOLCHAINS: [&str; 10] = [
    ".npm", ".nvm", ".cache", ".vscode", ".rustup", ".cargo", ".local", ".gemini", ".gradle", ".m2",
];

/// Total "where your storage goes" rows: measured + the two computed ones.
pub fn finish_map(mut measured: Vec<MapEntry>, disk: &DiskStats) -> Vec<MapEntry> {
    let known: u64 = measured.iter().map(|m| m.bytes).sum();
    measured.push(MapEntry {
        id: "macos",
        label: "macOS volumes".into(),
        bytes: disk.used_bytes.saturating_sub(disk.data_used_bytes),
        note: Some("System, Preboot, Recovery and swap: see Disk volumes.".into()),
    });
    measured.push(MapEntry {
        id: "other",
        label: "Other users & system data".into(),
        bytes: disk.data_used_bytes.saturating_sub(known),
        note: Some("Not broken down yet. A deep scan explains it.".into()),
    });
    measured.sort_by_key(|m| std::cmp::Reverse(m.bytes));
    measured
}

/// Root causes, biggest first (the script's rules, plus Time Machine and
/// Docker's disk image).
pub fn causes(
    vols: &[Volume],
    snaps: &LocalSnapshots,
    docker: &DockerUsage,
    docker_raw_bytes: u64,
) -> Vec<Cause> {
    let mut out = Vec::new();
    let mut update_flagged = false;
    for v in vols.iter().filter(|v| v.oversized) {
        match v.role.as_str() {
            "Preboot" | "Update" if snaps.pending_update => {
                update_flagged = true;
                out.push(Cause {
                    bytes: Some(v.bytes),
                    text: format!(
                        "The {} volume is oversized by a downloaded macOS update.",
                        v.label
                    ),
                    fix: "Install it: System Settings → General → Software Update.".into(),
                });
            }
            "VM" => out.push(Cause {
                bytes: Some(v.bytes),
                text: "Swap memory has grown large.".into(),
                fix: "Restart your Mac to reset it (see the Memory tab).".into(),
            }),
            _ => {}
        }
    }
    if snaps.pending_update && !update_flagged {
        out.push(Cause {
            bytes: None,
            text: "A macOS update is downloaded but not installed.".into(),
            fix:
                "Install it to release its snapshots: System Settings → General → Software Update."
                    .into(),
        });
    }
    if snaps.time_machine > 0 {
        out.push(Cause {
            bytes: None,
            text: format!(
                "{} Time Machine local snapshot{} on this disk.",
                snaps.time_machine,
                if snaps.time_machine == 1 { "" } else { "s" }
            ),
            fix: "macOS deletes them on its own when space runs low; nothing to do unless you need the space now."
                .into(),
        });
    }
    if docker.running && docker_raw_bytes > docker.used_bytes + 5 * GB {
        out.push(Cause {
            bytes: Some(docker_raw_bytes - docker.used_bytes),
            text: format!(
                "Docker's disk image takes {} but holds {}.",
                crate::doctor::vscode::fmt_mb(docker_raw_bytes),
                crate::doctor::vscode::fmt_mb(docker.used_bytes)
            ),
            fix: "It gives space back slowly after a cleanup; Docker Desktop → Settings → Resources caps its size."
                .into(),
        });
    }
    out.sort_by_key(|c| std::cmp::Reverse(c.bytes.unwrap_or(0)));
    out
}

/// `/Users/*` other than me, Shared and Guest.
pub fn other_users(users_dir: &Path, me: &str) -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(users_dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()))
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| n != me && n != "Shared" && n != "Guest" && !n.starts_with('.'))
        .collect();
    v.sort();
    v
}

/// Formula families installed in more than one version (`brew leaves`).
pub fn brew_duplicates(leaves: &str) -> Vec<String> {
    let mut by: std::collections::BTreeMap<&str, Vec<&str>> = Default::default();
    for l in leaves.lines().map(str::trim).filter(|l| !l.is_empty()) {
        let base = l
            .rsplit('/')
            .next()
            .unwrap_or(l)
            .split('@')
            .next()
            .unwrap_or(l);
        by.entry(base).or_default().push(l);
    }
    by.into_iter()
        .filter(|(_, v)| v.len() > 1)
        .map(|(_, v)| v.join(", "))
        .collect()
}

pub struct ScanInputs<'a> {
    pub home: PathBuf,
    pub user: String,
    pub brew_prefix: Option<String>,
    pub rules: &'a Rules,
    pub cancel: &'a AtomicBool,
}

pub fn run(inp: &ScanInputs, progress: &(dyn Fn(Progress) + Sync)) -> AppResult<StorageReport> {
    let start = Instant::now();
    let cancelled = || AppError::Cancelled("Scan cancelled.".into());
    let disk = disk::disk_stats()
        .ok_or_else(|| AppError::Shell("couldn't read disk usage (df)".into()))?;
    let env = Env {
        home: inp.home.clone(),
        brew_prefix: inp.brew_prefix.clone(),
        rules: inp.rules,
        now: SystemTime::now(),
        cancel: inp.cancel,
    };
    let h = |rel: &str| inp.home.join(rel);
    let docker = catalog::docker_usage(&env);
    let raw = measure::allocated(&docker_raw(&inp.home));

    // Map rows + cleanup items share one queue so progress is one bar.
    enum Out {
        Map(MapEntry),
        Item(CleanItem),
    }
    let map_job = |id: &'static str,
                   label: &str,
                   paths: Vec<PathBuf>,
                   ignore: &'static [&'static str],
                   note: Option<&str>| {
        let label = label.to_string();
        let note = note.map(String::from);
        let cancel = inp.cancel;
        let f: Box<dyn FnOnce() -> Option<Out> + Send> = Box::new(move || {
            let refs: Vec<&Path> = paths.iter().map(PathBuf::as_path).collect();
            Some(Out::Map(MapEntry {
                id,
                label,
                bytes: du(&refs, ignore, cancel)?,
                note,
            }))
        });
        f
    };
    let mut jobs: Vec<Job<'_, Out>> = vec![
        (
            "Applications".into(),
            map_job(
                "apps",
                "Applications",
                vec!["/Applications".into()],
                &[],
                None,
            ),
        ),
        (
            "Desktop".into(),
            map_job(
                "desktop",
                "Desktop (projects)",
                vec![h("Desktop")],
                &[],
                None,
            ),
        ),
        (
            "Library".into(),
            map_job(
                "library",
                "Library (app data)",
                vec![h("Library")],
                &["Containers", "Group Containers"],
                Some("Other apps' containers aren't measured: macOS asks permission for those."),
            ),
        ),
        (
            "Downloads".into(),
            map_job("downloads", "Downloads", vec![h("Downloads")], &[], None),
        ),
        (
            "Dev toolchains".into(),
            map_job(
                "devtools",
                "Dev toolchains (.npm, .nvm, …)",
                DEV_TOOLCHAINS.iter().map(|d| h(d)).collect(),
                &[],
                None,
            ),
        ),
    ];
    if let Some(p) = inp.brew_prefix.clone() {
        jobs.push((
            "Homebrew".into(),
            map_job("homebrew", "Homebrew", vec![PathBuf::from(p)], &[], None),
        ));
    }
    for id in ITEM_IDS {
        let (env, docker) = (&env, &docker);
        jobs.push((
            id.to_string(),
            Box::new(move || catalog::measure_item(id, env, docker).map(Out::Item)),
        ));
    }

    let total = jobs.len();
    let done = AtomicUsize::new(0);
    let on_done = |label: &str| {
        let d = done.fetch_add(1, Ordering::Relaxed) + 1;
        progress(Progress {
            label: label.to_string(),
            done: d,
            total,
        });
    };
    let outs = par(jobs, &on_done).ok_or_else(cancelled)?;

    let mut map = vec![MapEntry {
        id: "docker",
        label: "Docker disk image".into(),
        bytes: raw,
        note: None,
    }];
    let mut items = Vec::new();
    for o in outs {
        match o {
            Out::Map(m) => map.push(m),
            Out::Item(i) => items.push(i),
        }
    }
    map.retain(|m| m.bytes > 0 || m.id != "docker");

    let vols = disk::apfs_volumes();
    let snaps = disk::local_snapshots();
    let causes = causes(&vols, &snaps, &docker, raw);
    let insights = insights(inp, &env, &snaps).ok_or_else(cancelled)?;

    Ok(StorageReport {
        scanned_at: crate::doctor::claude::now_epoch(),
        scan_ms: start.elapsed().as_millis() as u64,
        map: finish_map(map, &disk),
        disk,
        volumes: vols,
        causes,
        items,
        insights,
    })
}

fn insights(inp: &ScanInputs, env: &Env, snaps: &LocalSnapshots) -> Option<Vec<Insight>> {
    let mut out = Vec::new();
    let others = other_users(Path::new("/Users"), &inp.user);
    if !others.is_empty() {
        out.push(Insight {
            id: "other_users",
            text: format!("Other user accounts: {}. Their files count against this disk.", others.join(", ")),
            detail: vec!["Log into them to clean, or remove unused ones in System Settings → Users & Groups.".into()],
        });
    }
    if snaps.pending_update {
        out.push(Insight {
            id: "pending_update",
            text: "A macOS update is downloaded but not installed. Installing it frees snapshot space.".into(),
            detail: vec![],
        });
    }
    // ~/.Trash needs Full Disk Access to read; unreadable means unknown, not empty.
    let trash = inp.home.join(".Trash");
    if std::fs::read_dir(&trash).is_ok() {
        let b = du(&[&trash], &[], inp.cancel)?;
        if b > 100 * 1024 * 1024 {
            out.push(Insight {
                id: "trash",
                text: format!(
                    "Trash holds {}. Empty it from Finder when you're ready.",
                    crate::doctor::vscode::fmt_mb(b)
                ),
                detail: vec![],
            });
        }
    }
    if let Some(brew) = inp
        .brew_prefix
        .as_deref()
        .map(|p| Path::new(p).join("bin/brew"))
    {
        if let Some(leaves) = tools::output(&brew, &["leaves"], std::time::Duration::from_secs(20))
        {
            let dups = brew_duplicates(&leaves);
            if !dups.is_empty() {
                out.push(Insight {
                    id: "brew_versions",
                    text: "Several versions of the same Homebrew formula are installed.".into(),
                    detail: dups,
                });
            }
        }
    }
    let cutoff =
        std::time::Duration::from_secs(u64::from(env.rules.stale_node_modules_days) * 86_400);
    let mut stale: Vec<(u64, PathBuf)> = Vec::new();
    for d in catalog::find_dirs(&env.rules.roots(&env.home), "node_modules", env.rules, 6) {
        let old = std::fs::metadata(&d)
            .and_then(|m| m.modified())
            .is_ok_and(|t| env.now.duration_since(t).unwrap_or_default() > cutoff);
        if old {
            stale.push((du(&[&d], &[], inp.cancel)?, d));
        }
    }
    stale.sort_by_key(|s| std::cmp::Reverse(s.0));
    if !stale.is_empty() {
        out.push(Insight {
            id: "stale_node_modules",
            text: format!(
                "node_modules untouched for {}+ days (npm install restores them).",
                env.rules.stale_node_modules_days
            ),
            detail: stale
                .iter()
                .take(5)
                .map(|(b, d)| format!("{} · {}", env.tilde(d), crate::doctor::vscode::fmt_mb(*b)))
                .collect(),
        });
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vol(role: &str, bytes: u64, oversized: bool) -> Volume {
        Volume {
            role: role.into(),
            label: role.into(),
            why: String::new(),
            bytes,
            oversized,
        }
    }

    #[test]
    fn remainder_and_macos_rows_are_computed_from_df() {
        let disk = DiskStats {
            total_bytes: 1000,
            used_bytes: 900,
            free_bytes: 100,
            data_used_bytes: 700,
        };
        let m = finish_map(
            vec![
                MapEntry {
                    id: "apps",
                    label: "Applications".into(),
                    bytes: 300,
                    note: None,
                },
                MapEntry {
                    id: "library",
                    label: "Library".into(),
                    bytes: 100,
                    note: None,
                },
            ],
            &disk,
        );
        let by = |id: &str| m.iter().find(|x| x.id == id).unwrap().bytes;
        assert_eq!(by("macos"), 200);
        assert_eq!(by("other"), 300);
        assert_eq!(m[0].id, "apps", "biggest first (ties keep input order)");
        // Over-measured (hard links, timing) never goes negative.
        let m = finish_map(
            vec![MapEntry {
                id: "apps",
                label: "x".into(),
                bytes: 5000,
                note: None,
            }],
            &disk,
        );
        assert_eq!(m.iter().find(|x| x.id == "other").unwrap().bytes, 0);
    }

    #[test]
    fn causes_follow_the_scripts_rules() {
        let none = LocalSnapshots::default();
        let docker = DockerUsage::default();
        // Oversized Preboot alone (this Mac today) is not a cause without an update pending.
        assert!(causes(&[vol("Preboot", 18 * GB, true)], &none, &docker, 0).is_empty());
        let pending = LocalSnapshots {
            pending_update: true,
            time_machine: 0,
        };
        let c = causes(&[vol("Preboot", 18 * GB, true)], &pending, &docker, 0);
        assert_eq!(c.len(), 1);
        assert!(c[0].fix.contains("Software Update"));
        // Pending update without an oversized volume is still reported, once.
        assert_eq!(causes(&[], &pending, &docker, 0).len(), 1);
        let c = causes(&[vol("VM", 9 * GB, true)], &none, &docker, 0);
        assert!(c[0].fix.contains("Restart"));
        let tm = LocalSnapshots {
            pending_update: false,
            time_machine: 3,
        };
        assert!(causes(&[], &tm, &docker, 0)[0]
            .text
            .starts_with("3 Time Machine local snapshots"));
    }

    #[test]
    fn docker_image_slack_is_a_cause_only_when_large() {
        let none = LocalSnapshots::default();
        let docker = DockerUsage {
            installed: true,
            running: true,
            used_bytes: 10 * GB,
            ..Default::default()
        };
        assert!(causes(&[], &none, &docker, 14 * GB).is_empty());
        let c = causes(&[], &none, &docker, 30 * GB);
        assert_eq!(c[0].bytes, Some(20 * GB));
        let stopped = DockerUsage {
            running: false,
            ..docker
        };
        assert!(
            causes(&[], &none, &stopped, 30 * GB).is_empty(),
            "can't judge a stopped Docker"
        );
    }

    #[test]
    fn brew_duplicate_families() {
        let d = brew_duplicates("node@20\nnode@22\nredis\npostgresql@16\nmongodb/brew/mongodb-community@7.0\nmongodb-community@8.0\n");
        assert_eq!(
            d,
            [
                "mongodb/brew/mongodb-community@7.0, mongodb-community@8.0",
                "node@20, node@22"
            ]
        );
        assert!(brew_duplicates("redis\n").is_empty());
    }

    #[test]
    fn other_accounts_skip_self_shared_guest() {
        let d = std::env::temp_dir().join(format!("maclean-users-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        for u in ["me", "Shared", "Guest", "arpit", ".localized"] {
            std::fs::create_dir_all(d.join(u)).unwrap();
        }
        assert_eq!(other_users(&d, "me"), ["arpit"]);
    }

    #[test]
    fn par_runs_everything_and_reports_progress() {
        let seen = AtomicUsize::new(0);
        let jobs: Vec<Job<'_, usize>> = (0..10usize)
            .map(|i| {
                (
                    format!("j{i}"),
                    Box::new(move || Some(i * 2)) as Box<dyn FnOnce() -> Option<usize> + Send>,
                )
            })
            .collect();
        let out = par(jobs, &|_| {
            seen.fetch_add(1, Ordering::Relaxed);
        })
        .unwrap();
        assert_eq!(
            out,
            (0..10usize).map(|i| i * 2).collect::<Vec<_>>(),
            "results keep job order"
        );
        assert_eq!(seen.load(Ordering::Relaxed), 10);
        let jobs: Vec<Job<'_, usize>> = vec![
            ("a".into(), Box::new(|| Some(1))),
            ("b".into(), Box::new(|| None)),
        ];
        assert_eq!(
            par(jobs, &|_| {}),
            None,
            "one cancelled job cancels the scan"
        );
    }
}

#[cfg(test)]
mod real_mac {
    use super::*;

    // Full scan of this Mac, read-only. Ignored in CI.
    // cargo test real_scan -- --ignored --nocapture
    #[test]
    #[ignore]
    fn real_scan_on_this_mac() {
        let rules = Rules::default();
        let cancel = AtomicBool::new(false);
        let inputs = ScanInputs {
            home: crate::doctor::paths::home().unwrap(),
            user: std::env::var("USER").unwrap(),
            brew_prefix: Some("/opt/homebrew".into()),
            rules: &rules,
            cancel: &cancel,
        };
        let r = run(&inputs, &|_| {}).unwrap();
        let gb = |b: u64| b as f64 / 1024.0 / 1024.0 / 1024.0;
        println!(
            "scan {} ms · used {:.1} GB · free {:.1} GB",
            r.scan_ms,
            gb(r.disk.used_bytes),
            gb(r.disk.free_bytes)
        );
        for m in &r.map {
            println!("  map  {:<34} {:>7.1} GB", m.label, gb(m.bytes));
        }
        for v in &r.volumes {
            println!(
                "  vol  {:<34} {:>7.1} GB {}",
                v.label,
                gb(v.bytes),
                if v.oversized { "⚠" } else { "" }
            );
        }
        for i in &r.items {
            println!(
                "  item {:<38} {:>9.2} GB  {:?}",
                i.label,
                gb(i.bytes),
                i.skip
            );
        }
        for c in &r.causes {
            println!("  cause {} → {}", c.text, c.fix);
        }
        for i in &r.insights {
            println!("  look {} {:?}", i.text, i.detail);
        }
        assert!(r.disk.total_bytes > 0 && !r.map.is_empty() && r.items.len() == ITEM_IDS.len());
    }
}
