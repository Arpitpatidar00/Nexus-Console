// Mac Clean commands — thin wrappers over `crate::maclean`. The frontend sends
// nothing but "scan" / "cancel"; every path is resolved in Rust.

use super::{blocking, confirm_action};
use crate::context::AppContext;
use crate::error::{AppError, AppResult};
use crate::maclean::appdata::{self, AppDataReport};
use crate::maclean::catalog::{self, Env};
use crate::maclean::clean::{self, CleanResult, ItemResult};
use crate::maclean::projects::{self, ProjectsReport};
use crate::maclean::scan::{self, ScanInputs, StorageReport};
use crate::maclean::store::{JournalEntry, Rules};
use crate::maclean::{disk, MacleanState};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager};

/// Measurement progress while a scan runs ("Library" 5/21).
pub const PROGRESS_EVENT: &str = "maclean://progress";

/// Per-item state while a clean runs.
pub const CLEAN_EVENT: &str = "maclean://clean";

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CleanProgress<'a> {
    id: &'a str,
    state: &'a str,
    message: &'a str,
}

/// The full storage report. Read-only; streams progress; one at a time
/// (a second request while one runs gets `Busy`).
#[tauri::command]
pub async fn maclean_scan(app: AppHandle) -> AppResult<StorageReport> {
    crate::core::consent::require_consent(crate::core::consent::DataSource::LibraryScan)?;
    blocking(move || {
        let state = app.state::<MacleanState>();
        let _one = state
            .scanning
            .try_lock()
            .map_err(|_| AppError::Busy("A scan is already running.".into()))?;
        state.cancel.store(false, Ordering::Relaxed);
        let rules = state.read()?.rules.clone();
        let home = crate::doctor::paths::home()
            .ok_or_else(|| AppError::NotFound("HOME not set".into()))?;
        let user = std::env::var("USER").unwrap_or_default();
        let inputs = ScanInputs {
            home: home.clone(),
            user,
            brew_prefix: app.state::<AppContext>().brew_prefix.clone(),
            rules: &rules,
            cancel: &state.cancel,
        };
        let report = scan::run(&inputs, &|p| {
            let _ = app.emit(PROGRESS_EVENT, &p);
        })?;
        if let Ok(mut last) = state.last_report.lock() {
            *last = Some(report.clone());
        }

        // Record daily trend snapshot (P9.4)
        let hist_file = home
            .join(".config")
            .join("stackroost")
            .join("maclean-history.json");
        let mut trend_store = crate::services::maclean::trends::TrendStore::load(&hist_file);
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_secs());
        let date = chrono_free_date(ts / 86400);
        let mut categories = std::collections::HashMap::new();
        for item in &report.items {
            categories.insert(item.id.to_string(), item.bytes);
        }
        let free_bytes = report.disk.free_bytes;
        let total_bytes = report.disk.total_bytes;
        trend_store.record(crate::services::maclean::trends::TrendRecord {
            date,
            timestamp: ts,
            free_disk_bytes: free_bytes,
            total_disk_bytes: total_bytes,
            swap_used_bytes: 0,
            categories,
        });
        let _ = trend_store.save(&hist_file);
        Ok(report)
    })
    .await
}

#[tauri::command]
pub async fn maclean_cancel_scan(app: AppHandle) -> AppResult<()> {
    app.state::<MacleanState>()
        .cancel
        .store(true, Ordering::Relaxed);
    Ok(())
}

fn fmt(b: u64) -> String {
    crate::doctor::vscode::fmt_mb(b)
}

/// Clean the selected item ids (never paths). Re-measures and re-checks skip
/// rules, asks once natively listing everything, cleans item by item with
/// progress events, then reports what `df` says was actually freed.
#[tauri::command]
pub async fn maclean_clean(app: AppHandle, ids: Vec<String>) -> AppResult<CleanResult> {
    blocking(move || {
        let selected = clean::validate_selection(&ids)?;
        let state = app.state::<MacleanState>();
        let _one = state
            .scanning
            .try_lock()
            .map_err(|_| AppError::Busy("A scan or clean is already running.".into()))?;
        state.cancel.store(false, Ordering::Relaxed);
        let rules = state.read()?.rules.clone();
        let home = crate::doctor::paths::home()
            .ok_or_else(|| AppError::NotFound("HOME not set".into()))?;
        let env = Env {
            home,
            brew_prefix: app.state::<AppContext>().brew_prefix.clone(),
            rules: &rules,
            now: std::time::SystemTime::now(),
            cancel: &state.cancel,
        };
        let docker = catalog::docker_usage(&env);

        let mut plan = Vec::new();
        let mut skipped = Vec::new();
        for id in selected {
            let Some(item) = catalog::measure_item(id, &env, &docker) else {
                return Err(AppError::Cancelled("Cancelled — nothing changed.".into()));
            };
            match &item.skip {
                Some(why) => skipped.push(format!("{} — skipped: {why}", item.label)),
                None if item.bytes > 0 => plan.push(item),
                None => {}
            }
        }
        if plan.is_empty() {
            return Err(AppError::NotFound("Nothing to clean right now.".into()));
        }
        let total: u64 = plan.iter().map(|i| i.bytes).sum();
        let mut lines: Vec<String> = plan
            .iter()
            .map(|i| format!("• {} — {}", i.label, fmt(i.bytes)))
            .collect();
        if let Some(images) = plan.iter().find(|i| i.id == "docker_images") {
            lines.push(format!("  Images: {}", images.detail.join(", ")));
        }
        lines.extend(skipped.iter().map(|s| format!("• {s}")));
        confirm_action(
            &app,
            &format!(
                "Clean {} item{} ({})?",
                plan.len(),
                if plan.len() == 1 { "" } else { "s" },
                fmt(total)
            ),
            &format!(
                "{}\n\nOnly caches, logs and build output that tools recreate on their own. \
                 Protected projects, .git, .env and source folders are never touched.",
                lines.join("\n")
            ),
            "Clean",
            true,
        )?;

        let before = disk::disk_stats().map_or(0, |d| d.free_bytes);
        let brew_lock = app.state::<crate::brew::BrewLock>();
        let mut results = Vec::new();
        for item in &plan {
            let _ = app.emit(
                CLEAN_EVENT,
                CleanProgress {
                    id: item.id,
                    state: "running",
                    message: "",
                },
            );
            let r = clean::clean_item(item.id, &env, &docker, &brew_lock.0);
            let (ok, message) = match r {
                Ok(m) => (true, m),
                Err(m) => (false, m),
            };
            let _ = app.emit(
                CLEAN_EVENT,
                CleanProgress {
                    id: item.id,
                    state: if ok { "done" } else { "error" },
                    message: &message,
                },
            );
            results.push(ItemResult {
                id: item.id.into(),
                label: item.label.clone(),
                ok,
                message,
            });
        }
        if plan.iter().any(|i| i.id == "brew") {
            app.state::<crate::commands::services::ServicesCache>()
                .invalidate();
        }
        // APFS frees asynchronously; the script waits too.
        std::thread::sleep(std::time::Duration::from_secs(2));
        let after = disk::disk_stats().map_or(0, |d| d.free_bytes);
        let result = CleanResult {
            at_epoch: crate::doctor::claude::now_epoch(),
            freed_bytes: after.saturating_sub(before),
            items: results,
        };
        // Best-effort: the deletions already happened.
        let _ = state.write(|s| {
            s.append_journal(JournalEntry {
                at_epoch: result.at_epoch,
                items: result
                    .items
                    .iter()
                    .filter(|i| i.ok)
                    .map(|i| i.label.clone())
                    .collect(),
                freed_bytes: result.freed_bytes,
                errors: result
                    .items
                    .iter()
                    .filter(|i| !i.ok)
                    .map(|i| format!("{}: {}", i.label, i.message))
                    .collect(),
                auto: false,
            });
            Ok(())
        });
        Ok(result)
    })
    .await
}

#[tauri::command]
pub async fn maclean_rules(app: AppHandle) -> AppResult<Rules> {
    blocking(move || Ok(app.state::<MacleanState>().read()?.rules.clone())).await
}

#[tauri::command]
pub async fn maclean_set_rules(app: AppHandle, rules: Rules) -> AppResult<()> {
    blocking(move || {
        clean::validate_rules(&rules)?;
        let rules = Rules {
            protected_names: rules
                .protected_names
                .iter()
                .map(|n| n.trim().to_string())
                .collect(),
            ..rules
        };
        app.state::<MacleanState>().write(|s| {
            s.rules = rules;
            Ok(())
        })
    })
    .await
}

#[tauri::command]
pub async fn maclean_journal(app: AppHandle) -> AppResult<Vec<JournalEntry>> {
    blocking(move || Ok(app.state::<MacleanState>().read()?.journal.clone())).await
}

/// Memory composition, pressure, swap (and whether it's swapping now), top
/// apps. Read-only and cheap; the Memory tab polls it.
#[tauri::command]
pub async fn maclean_memory(app: AppHandle) -> AppResult<crate::maclean::memory::MemoryReport> {
    blocking(move || {
        crate::maclean::memory::sample(
            &app.state::<MacleanState>().memory,
            crate::doctor::claude::now_epoch(),
        )
        .ok_or_else(|| AppError::Shell("couldn't read memory statistics (vm_stat)".into()))
    })
    .await
}

/// The script's `--deep`: one native admin prompt, a constant read-only `du`
/// script as root, explained against the latest storage report.
#[tauri::command]
pub async fn maclean_deep_scan(app: AppHandle) -> AppResult<crate::maclean::deep::DeepReport> {
    crate::core::consent::require_consent(crate::core::consent::DataSource::LibraryScan)?;
    blocking(move || {
        let state = app.state::<MacleanState>();
        let last = state
            .last_report
            .lock()
            .map_err(|_| AppError::Io("report lock poisoned".into()))?
            .clone()
            .ok_or_else(|| AppError::NotFound("Run a storage scan first.".into()))?;
        let mut raw = crate::maclean::deep::run_raw()?;
        let me = std::env::var("USER").unwrap_or_default();
        let home = crate::doctor::paths::home()
            .ok_or_else(|| AppError::NotFound("HOME not set".into()))?;
        // The root shell lacks the app's FDA: our own home comes from an
        // in-process `du` instead (the script skips the console user; drop any
        // rows it still emitted for us, e.g. under fast user switching).
        let home_prefix = format!("{}/", home.to_string_lossy());
        raw.retain(|i| {
            !(i.tag == "user_total" && i.name == me)
                && !(i.tag == "user_sub" && i.name.starts_with(&format!("{me}/")))
                && !(i.tag == "eperm" && i.path.starts_with(&home_prefix))
        });
        raw.extend(crate::maclean::deep::measure_home(&home, &me)?);
        let snapshots = crate::maclean::disk::list_apfs_snapshots();
        let purgeable = crate::maclean::disk::query_purgeable_bytes();
        let report = crate::maclean::deep::build_report(
            &raw,
            &me,
            &last.map,
            last.disk.data_used_bytes,
            &snapshots,
            purgeable,
            crate::maclean::deep::has_full_disk_access(),
        );
        let mut deep_paths = Vec::new();
        for cat in &report.categories {
            for sub in &cat.sub_items {
                if !sub.path.is_empty() {
                    deep_paths.push(sub.path.clone());
                }
            }
        }
        if let Ok(mut lock) = state.last_deep_paths.lock() {
            *lock = deep_paths;
        }
        if let Ok(mut lock) = state.last_deep_deletable.lock() {
            *lock = report
                .categories
                .iter()
                .flat_map(|c| &c.sub_items)
                .filter(|s| s.is_deletable && s.path.starts_with('/'))
                .map(|s| s.path.clone())
                .collect();
        }
        Ok(report)
    })
    .await
}

/// The 10 biggest children of one map row (by id; Rust picks the folders).
#[tauri::command]
pub async fn maclean_drill(
    app: AppHandle,
    id: String,
) -> AppResult<Vec<crate::maclean::explore::Child>> {
    blocking(move || {
        let home = crate::doctor::paths::home()
            .ok_or_else(|| AppError::NotFound("HOME not set".into()))?;
        let state = app.state::<MacleanState>();
        let prefix = app.state::<AppContext>().brew_prefix.clone();
        crate::maclean::explore::drill_roots(&id, &home, prefix.as_deref())
            .ok_or_else(|| AppError::InvalidName(format!("can't look inside {id}")))?;
        crate::maclean::explore::drill(&id, &home, prefix.as_deref(), &state.cancel)
            .ok_or_else(|| AppError::Cancelled("Cancelled.".into()))
    })
    .await
}

/// Show a large file in Finder. Only paths the latest report listed.
#[tauri::command]
pub async fn maclean_reveal(app: AppHandle, path: String) -> AppResult<()> {
    blocking(move || {
        // App-data folders are listed as `~/…`.
        let path = match (path.strip_prefix("~/"), crate::doctor::paths::home()) {
            (Some(rest), Some(home)) => home.join(rest).to_string_lossy().into_owned(),
            _ => path,
        };
        let listed = app
            .state::<MacleanState>()
            .last_report
            .lock()
            .map_err(|_| AppError::Io("report lock poisoned".into()))?
            .as_ref()
            .is_some_and(|r| r.large_files.iter().any(|f| f.path == path))
            // Ghost leftovers are revealable too — they're never in large_files,
            // so their Reveal button always failed with Forbidden.
            || state_ghost_listed(&app, &path)
            || state_scan_listed(&app, &path)
            || state_deep_listed(&app, &path);
        if !listed {
            return Err(AppError::Forbidden(
                "Only files from the latest scan can be revealed.".into(),
            ));
        }
        match std::fs::symlink_metadata(&path) {
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Err(AppError::NotFound(
                    "It's gone since the scan. Run the scan again.".into(),
                ))
            }
            Err(_) => {
                return Err(AppError::Forbidden(
                    "macOS doesn't let Stackroost open this location.".into(),
                ))
            }
        }
        std::process::Command::new("/usr/bin/open")
            .args(["-R", "--", &path])
            .status()
            .map_err(|e| AppError::Shell(format!("open failed: {e}")))?;
        Ok(())
    })
    .await
}

/// Open macOS System Settings directly to Privacy & Security -> Full Disk Access.
#[tauri::command]
pub async fn maclean_open_full_disk_access() -> AppResult<()> {
    blocking(move || {
        std::process::Command::new("/usr/bin/open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
            .status()
            .map_err(|e| AppError::Shell(format!("Failed to open Full Disk Access: {e}")))?;
        Ok(())
    })
    .await
}

/// Open macOS System Settings directly to Users & Groups.
#[tauri::command]
pub async fn maclean_open_users_and_groups() -> AppResult<()> {
    blocking(move || {
        let res = std::process::Command::new("/usr/bin/open")
            .arg("x-apple.systempreferences:com.apple.Users-Profiles-Settings.extension")
            .status();
        if res.is_err() || !res.as_ref().unwrap().success() {
            let _ = std::process::Command::new("/usr/bin/open")
                .arg("/System/Library/PreferencePanes/Accounts.prefPane")
                .status();
        }
        Ok(())
    })
    .await
}

/// Thin local APFS snapshots safely via tmutil.
#[tauri::command]
pub async fn maclean_thin_snapshots() -> AppResult<String> {
    blocking(move || {
        let out = std::process::Command::new("/usr/bin/tmutil")
            .args(["thinlocalsnapshots", "/", "999999999999", "4"])
            .output()
            .map_err(|e| AppError::Shell(format!("Failed to run tmutil: {e}")))?;
        let msg = String::from_utf8_lossy(&out.stdout).to_string();
        Ok(msg)
    })
    .await
}

/// Delete a specific local APFS snapshot by identifier/date.
#[tauri::command]
pub async fn maclean_delete_snapshot(app: AppHandle, date: String) -> AppResult<String> {
    blocking(move || {
        confirm_action(
            &app,
            &format!("Delete local snapshot {}?", date),
            "This will delete the local APFS Time Machine snapshot to reclaim disk space.",
            "Delete",
            true,
        )?;
        if date.contains('/') || date.contains(';') || date.contains('&') || date.contains(' ') {
            return Err(AppError::InvalidName("Invalid snapshot identifier".into()));
        }
        let out = std::process::Command::new("/usr/bin/tmutil")
            .args(["deletelocalsnapshots", &date])
            .output()
            .map_err(|e| AppError::Shell(format!("Failed to run tmutil: {e}")))?;
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr);
            return Err(AppError::Shell(format!("Failed to delete snapshot: {err}")));
        }
        let msg = String::from_utf8_lossy(&out.stdout).to_string();
        Ok(msg)
    })
    .await
}

/// Empty one reclaimable cache folder from the latest Deep Scan into the Trash.
/// Only rows that scan marked reclaimable are accepted (all inside the home);
/// the folder itself stays, its entries move to the Trash one by one.
#[tauri::command]
pub async fn maclean_delete_path(app: AppHandle, path: String) -> AppResult<String> {
    blocking(move || {
        let state = app.state::<MacleanState>();
        let listed = state
            .last_deep_deletable
            .lock()
            .is_ok_and(|l| l.iter().any(|x| x == &path));
        if !listed {
            return Err(AppError::Forbidden(
                "Only reclaimable items from the latest deep scan can be cleaned. Run the deep scan again.".into(),
            ));
        }
        let p = std::path::PathBuf::from(&path);
        let home = crate::doctor::paths::home()
            .ok_or_else(|| AppError::NotFound("HOME not set".into()))?;
        let rules = state.read()?.rules.clone();
        if let Some(why) = clean::refuse_reason(&p, &home, &rules) {
            return Err(AppError::Forbidden(format!("Protected path: {why}")));
        }
        // Gone since the scan (cleaned elsewhere): nothing to do, not an error.
        if p.symlink_metadata().is_err() {
            return Ok("Already gone — nothing left to clean.".into());
        }
        confirm_action(
            &app,
            &format!("Move the contents of {path} to the Trash?"),
            "Apps rebuild their caches as needed. Items in use or protected by macOS are skipped.",
            "Move to Trash",
            true,
        )?;
        let (moved, skipped) = clean::trash_contents(&p, &home, &rules);
        match (moved, skipped) {
            (0, 0) => Ok("Already empty — nothing to clean.".into()),
            (0, s) => Err(AppError::Forbidden(format!(
                "macOS refused all {s} items (in use or protected). Quit the apps using them and try again."
            ))),
            (m, 0) => Ok(format!("Moved {m} items to the Trash.")),
            (m, s) => Ok(format!(
                "Moved {m} items to the Trash; skipped {s} in use or protected by macOS."
            )),
        }
    })
    .await
}

/// Projects, their build folders, app-data folders and agent backups from the
/// latest Projects / Apps & AI scans.
fn state_scan_listed(app: &AppHandle, path: &str) -> bool {
    let state = app.state::<MacleanState>();
    let in_projects = state.last_projects.lock().is_ok_and(|r| {
        r.as_ref().is_some_and(|r| {
            r.projects
                .iter()
                .any(|p| p.path == path || p.artifacts.iter().any(|a| a.path == path))
        })
    });
    let home = crate::doctor::paths::home();
    let in_appdata = state.last_appdata.lock().is_ok_and(|r| {
        r.as_ref().is_some_and(|r| {
            r.spots.iter().any(|s| {
                s.children.iter().any(|c| c.path == path)
                    || s.paths.iter().any(|p| {
                        home.as_ref()
                            .and_then(|h| p.strip_prefix("~/").map(|rest| h.join(rest)))
                            .is_some_and(|abs| abs.to_string_lossy() == path)
                    })
            })
        })
    });
    in_projects || in_appdata
}

fn state_ghost_listed(app: &AppHandle, path: &str) -> bool {
    app.state::<MacleanState>()
        .last_ghost_paths
        .lock()
        .is_ok_and(|p| p.iter().any(|x| x == path))
}

fn state_deep_listed(app: &AppHandle, path: &str) -> bool {
    app.state::<MacleanState>()
        .last_deep_paths
        .lock()
        .is_ok_and(|p| p.iter().any(|x| x == path))
}

fn chrono_free_date(days_since_epoch: u64) -> String {
    let z = days_since_epoch as i64 + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}

#[tauri::command]
pub async fn maclean_ghost_scan(
    app: AppHandle,
) -> AppResult<crate::services::maclean::ghost::GhostScanReport> {
    crate::core::consent::require_consent(crate::core::consent::DataSource::LibraryScan)?;
    blocking(move || {
        let home = crate::doctor::paths::home()
            .ok_or_else(|| AppError::NotFound("HOME not set".into()))?;
        let report = crate::services::maclean::ghost::scan_ghost_leftovers(&home);
        if let Ok(mut paths) = app.state::<MacleanState>().last_ghost_paths.lock() {
            *paths = report.leftovers.iter().map(|l| l.path.clone()).collect();
        }
        Ok(report)
    })
    .await
}

#[tauri::command]
pub async fn maclean_ghost_clean(app: AppHandle, ids: Vec<String>) -> AppResult<u64> {
    confirm_action(
        &app,
        &format!(
            "Clean {} ghost leftover item{}?",
            ids.len(),
            if ids.len() == 1 { "" } else { "s" }
        ),
        "This will permanently delete leftover application support folders for uninstalled apps.",
        "Delete Leftovers",
        true,
    )?;
    blocking(move || {
        let home = crate::doctor::paths::home()
            .ok_or_else(|| AppError::NotFound("HOME not set".into()))?;
        let report = crate::services::maclean::ghost::scan_ghost_leftovers(&home);
        crate::services::maclean::ghost::clean_ghost_leftovers(&home, &ids, &report.leftovers)
            .map_err(AppError::Io)
    })
    .await
}

#[tauri::command]
pub async fn maclean_energy_sample(
    _app: AppHandle,
) -> AppResult<crate::services::maclean::energy::EnergyReport> {
    blocking(move || Ok(crate::services::maclean::energy::sample_energy_report())).await
}

/// Energy → Pause, by PID. A Homebrew service is stopped through brew (the
/// proper way to quiet a daemon); anything else gets SIGSTOP and is tracked so
/// it can be resumed — and is resumed when Stackroost quits. The old version
/// took a process *name*, so most clicks failed validation or silently did
/// nothing after the user had confirmed.
#[tauri::command]
pub async fn maclean_pause_service(app: AppHandle, pid: i32) -> AppResult<()> {
    blocking(move || {
        if pid <= 1 || pid as u32 == std::process::id() {
            return Err(AppError::InvalidName(format!("can't pause PID {pid}")));
        }
        let name = process_name(pid)
            .ok_or_else(|| AppError::NotFound(format!("process {pid} is no longer running")))?;
        let services = crate::util::launchctl::parse_launchctl(
            &crate::commands::services::run_launchctl(),
        );
        let formula = services
            .iter()
            .find(|(_, p)| **p == pid as u32)
            .map(|(f, _)| f.clone());

        if let Some(formula) = formula {
            confirm_action(
                &app,
                &format!("Stop the {formula} service?"),
                &format!("{name} is the Homebrew service “{formula}”. Stackroost stops it with `brew services stop`; start it again from Services."),
                "Stop service",
                false,
            )?;
            let bin = app
                .state::<AppContext>()
                .brew_bin
                .clone()
                .ok_or_else(|| AppError::NotFound("Homebrew not found".into()))?;
            let lock = app.state::<crate::brew::BrewLock>();
            let _g = lock
                .0
                .lock()
                .map_err(|_| AppError::Io("brew lock poisoned".into()))?;
            crate::brew::run_brew(&bin, &["services", "stop", &formula])?;
            app.state::<crate::commands::services::ServicesCache>().invalidate();
            return Ok(());
        }

        confirm_action(
            &app,
            &format!("Pause {name}?"),
            &format!("PID {pid} stays in memory but stops using CPU and battery until you resume it. Stackroost resumes it when you quit."),
            "Pause",
            false,
        )?;
        signal(pid, libc::SIGSTOP)?;
        app.state::<MacleanState>()
            .paused
            .lock()
            .map_err(|_| AppError::Io("paused lock poisoned".into()))?
            .insert(pid);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn maclean_resume_process(app: AppHandle, pid: i32) -> AppResult<()> {
    blocking(move || {
        let state = app.state::<MacleanState>();
        let mut paused = state
            .paused
            .lock()
            .map_err(|_| AppError::Io("paused lock poisoned".into()))?;
        // Only what Energy itself paused — never an arbitrary SIGCONT.
        if !paused.remove(&pid) {
            return Err(AppError::NotFound(format!(
                "PID {pid} wasn't paused by Stackroost"
            )));
        }
        signal(pid, libc::SIGCONT)
    })
    .await
}

#[tauri::command]
pub async fn maclean_paused_pids(app: AppHandle) -> AppResult<Vec<i32>> {
    let state = app.state::<MacleanState>();
    let mut paused = state
        .paused
        .lock()
        .map_err(|_| AppError::Io("paused lock poisoned".into()))?;
    // Forget processes that exited while paused.
    // SAFETY: kill(pid, 0) only probes for existence.
    paused.retain(|&pid| unsafe { libc::kill(pid, 0) } == 0);
    Ok(paused.iter().copied().collect())
}

fn signal(pid: i32, sig: libc::c_int) -> AppResult<()> {
    // SAFETY: kill(2) with a plain signal has no memory preconditions.
    if unsafe { libc::kill(pid, sig) } == 0 {
        Ok(())
    } else {
        Err(AppError::Io(format!(
            "signal to PID {pid} failed: {}",
            std::io::Error::last_os_error()
        )))
    }
}

fn process_name(pid: i32) -> Option<String> {
    let pid = pid.to_string();
    let out = crate::core::exec::run(
        "/bin/ps",
        &["-p", pid.as_str(), "-o", "comm="],
        crate::core::exec::ExecOpts::default().no_check_exit(),
    )
    .ok()?;
    let path = out.stdout_str.trim();
    (!path.is_empty()).then(|| path.rsplit('/').next().unwrap_or(path).to_string())
}

#[tauri::command]
pub async fn maclean_trends(
    _app: AppHandle,
) -> AppResult<crate::services::maclean::trends::TrendsReport> {
    blocking(move || {
        let home = crate::doctor::paths::home()
            .ok_or_else(|| AppError::NotFound("HOME not set".into()))?;
        let hist_file = home
            .join(".config")
            .join("stackroost")
            .join("maclean-history.json");
        let store = crate::services::maclean::trends::TrendStore::load(&hist_file);
        Ok(store.report())
    })
    .await
}

#[tauri::command]
pub async fn maclean_duplicates_scan(
    app: AppHandle,
    dirs: Option<Vec<String>>,
) -> AppResult<crate::services::maclean::duplicates::DuplicateReport> {
    blocking(move || {
        let home = crate::doctor::paths::home()
            .ok_or_else(|| AppError::NotFound("HOME not set".into()))?;
        let target_dirs = if let Some(d) = dirs {
            d.into_iter().map(std::path::PathBuf::from).collect()
        } else {
            crate::services::maclean::duplicates::default_scan_directories(&home)
        };
        let report = crate::services::maclean::duplicates::scan_duplicates(&target_dirs);
        *app.state::<MacleanState>()
            .last_duplicates
            .lock()
            .map_err(|_| AppError::Io("duplicates lock poisoned".into()))? = Some(report.clone());
        Ok(report)
    })
    .await
}

#[tauri::command]
pub async fn maclean_duplicates_delete(app: AppHandle, paths: Vec<String>) -> AppResult<u64> {
    use crate::services::maclean::duplicates;
    blocking(move || {
        let state = app.state::<MacleanState>();
        // Paths are checked against the scan Rust produced — never trusted
        // as given — and each group keeps a copy.
        {
            let last = state
                .last_duplicates
                .lock()
                .map_err(|_| AppError::Io("duplicates lock poisoned".into()))?;
            let report = last
                .as_ref()
                .ok_or_else(|| AppError::Forbidden("Scan for duplicates first.".into()))?;
            duplicates::check_deletion(report, &paths).map_err(AppError::Forbidden)?;
        }
        let n = paths.len();
        confirm_action(
            &app,
            &format!("Move {n} duplicate file{} to the Trash?", if n == 1 { "" } else { "s" }),
            "At least one copy of every file stays where it is. You can put these back from the Trash.",
            "Move to Trash",
            true,
        )?;
        let home = crate::doctor::paths::home()
            .ok_or_else(|| AppError::NotFound("HOME not set".into()))?;
        let freed = duplicates::delete_duplicates(&home, &paths).map_err(AppError::Io)?;
        if let Ok(mut last) = state.last_duplicates.lock() {
            if let Some(r) = last.as_mut() {
                duplicates::forget_paths(r, &paths);
            }
        }
        Ok(freed)
    })
    .await
}

// --- Projects and Apps & AI ----------------------------------------------------

fn home_dir() -> AppResult<std::path::PathBuf> {
    crate::doctor::paths::home().ok_or_else(|| AppError::NotFound("HOME not set".into()))
}

/// Delete each item's folders with `safe_rm`, measure what the disk got back,
/// and journal it like a cleanup-plan run.
fn delete_and_journal(
    state: &MacleanState,
    items: Vec<(String, Vec<std::path::PathBuf>)>,
    home: &std::path::Path,
    rules: &Rules,
) -> CleanResult {
    let before = disk::disk_stats().map_or(0, |d| d.free_bytes);
    let items: Vec<ItemResult> = items
        .into_iter()
        .map(|(label, paths)| {
            let errors: Vec<String> = paths
                .iter()
                .filter_map(|p| clean::safe_rm(p, home, rules).err())
                .collect();
            ItemResult {
                id: label.clone(),
                label,
                ok: errors.is_empty(),
                message: if errors.is_empty() {
                    "deleted".into()
                } else {
                    errors.join("; ")
                },
            }
        })
        .collect();
    // APFS frees asynchronously.
    std::thread::sleep(std::time::Duration::from_secs(2));
    let after = disk::disk_stats().map_or(0, |d| d.free_bytes);
    let result = CleanResult {
        at_epoch: crate::doctor::claude::now_epoch(),
        freed_bytes: after.saturating_sub(before),
        items,
    };
    // Best-effort: the deletions already happened.
    let _ = state.write(|s| {
        s.append_journal(JournalEntry {
            at_epoch: result.at_epoch,
            items: result
                .items
                .iter()
                .filter(|i| i.ok)
                .map(|i| i.label.clone())
                .collect(),
            freed_bytes: result.freed_bytes,
            errors: result
                .items
                .iter()
                .filter(|i| !i.ok)
                .map(|i| format!("{}: {}", i.label, i.message))
                .collect(),
            auto: false,
        });
        Ok(())
    });
    result
}

/// Projects under the project roots and their rebuildable build output.
/// Lists folders and sizes only; nothing under ~/Library is read.
#[tauri::command]
pub async fn maclean_projects_scan(app: AppHandle) -> AppResult<ProjectsReport> {
    blocking(move || {
        let state = app.state::<MacleanState>();
        let _one = state
            .projects_busy
            .try_lock()
            .map_err(|_| AppError::Busy("Projects are already being scanned or cleaned.".into()))?;
        // Their own flag: resetting the shared one could undo a Cancel on the main scan.
        let cancel = std::sync::atomic::AtomicBool::new(false);
        let rules = state.read()?.rules.clone();
        let report = projects::scan(&home_dir()?, &rules, &cancel)
            .ok_or_else(|| AppError::Cancelled("Scan cancelled — nothing was measured.".into()))?;
        if let Ok(mut last) = state.last_projects.lock() {
            *last = Some(report.clone());
        }
        Ok(report)
    })
    .await
}

/// Delete build output the latest Projects scan listed — each path re-checked
/// (listed, unprotected, `refuse_reason`) — after a native confirm.
#[tauri::command]
pub async fn maclean_clean_projects(app: AppHandle, paths: Vec<String>) -> AppResult<CleanResult> {
    blocking(move || {
        let state = app.state::<MacleanState>();
        let _one = state
            .projects_busy
            .try_lock()
            .map_err(|_| AppError::Busy("Projects are already being scanned or cleaned.".into()))?;
        let rules = state.read()?.rules.clone();
        let home = home_dir()?;
        let report = state
            .last_projects
            .lock()
            .map_err(|_| AppError::Io("projects lock poisoned".into()))?
            .clone()
            .ok_or_else(|| AppError::NotFound("Scan projects first.".into()))?;
        let selected = projects::resolve_selection(&report, &paths, &home, &rules).map_err(AppError::Forbidden)?;
        if selected.is_empty() {
            return Err(AppError::NotFound("Nothing selected.".into()));
        }
        let total: u64 = selected.iter().map(|(_, a)| a.bytes).sum();
        let mut lines: Vec<String> = Vec::new();
        for (p, a) in &selected {
            lines.push(format!("• {} — {} ({}) → {}", p.display, a.name, fmt(a.bytes), a.rebuild));
        }
        let shown = lines.len().min(14);
        let more = lines.len() - shown;
        confirm_action(
            &app,
            &format!("Delete {} build folder{} ({})?", selected.len(), if selected.len() == 1 { "" } else { "s" }, fmt(total)),
            &format!(
                "{}{}\n\nEach comes back with the command shown. Source code, .git and .env files are never touched.",
                lines[..shown].join("\n"),
                if more > 0 { format!("\n…and {more} more") } else { String::new() }
            ),
            "Delete",
            true,
        )?;
        let items = selected
            .iter()
            .map(|(p, a)| (format!("{} · {}", p.name, a.name), vec![std::path::PathBuf::from(&a.path)]))
            .collect();
        let result = delete_and_journal(&state, items, &home, &rules);
        // What was deleted is gone from the report: a second click can't reuse it.
        if let Ok(mut last) = state.last_projects.lock() {
            *last = None;
        }
        Ok(result)
    })
    .await
}

/// Big per-app folders (AI tools, chat apps, models, VMs), labelled for what
/// deleting them costs. Reads sizes under ~/Library, so it needs that consent.
#[tauri::command]
pub async fn maclean_appdata_scan(app: AppHandle) -> AppResult<AppDataReport> {
    crate::core::consent::require_consent(crate::core::consent::DataSource::LibraryScan)?;
    blocking(move || {
        let state = app.state::<MacleanState>();
        let _one = state
            .appdata_busy
            .try_lock()
            .map_err(|_| AppError::Busy("App data is already being scanned or cleaned.".into()))?;
        // Their own flag: resetting the shared one could undo a Cancel on the main scan.
        let cancel = std::sync::atomic::AtomicBool::new(false);
        let report = appdata::scan_live(&home_dir()?, &cancel);
        if let Ok(mut last) = state.last_appdata.lock() {
            *last = Some(report.clone());
        }
        Ok(report)
    })
    .await
}

/// Clear app caches (app closed) and agent backups the latest scan listed.
#[tauri::command]
pub async fn maclean_clean_appdata(app: AppHandle, targets: Vec<String>) -> AppResult<CleanResult> {
    crate::core::consent::require_consent(crate::core::consent::DataSource::LibraryScan)?;
    blocking(move || {
        let state = app.state::<MacleanState>();
        let _one = state
            .appdata_busy
            .try_lock()
            .map_err(|_| AppError::Busy("App data is already being scanned or cleaned.".into()))?;
        let rules = state.read()?.rules.clone();
        let home = home_dir()?;
        let report = state
            .last_appdata
            .lock()
            .map_err(|_| AppError::Io("app data lock poisoned".into()))?
            .clone()
            .ok_or_else(|| AppError::NotFound("Scan Apps & AI first.".into()))?;
        let resolved = appdata::resolve(&report, &targets, &home, &rules, &crate::maclean::tools::app_running)
            .map_err(AppError::Forbidden)?;
        if resolved.is_empty() {
            return Err(AppError::NotFound("Nothing selected.".into()));
        }
        let size_of = |t: &String| {
            report
                .spots
                .iter()
                .find(|s| &s.id == t)
                .map(|s| s.bytes)
                .or_else(|| report.spots.iter().flat_map(|s| &s.children).find(|c| &c.path == t).map(|c| c.bytes))
                .unwrap_or(0)
        };
        let total: u64 = targets.iter().map(size_of).sum();
        let backups = resolved.iter().any(|r| r.label.starts_with("Gemini backup"));
        let lines: Vec<String> = resolved.iter().zip(&targets).map(|(r, t)| format!("• {} ({})", r.label, fmt(size_of(t)))).collect();
        confirm_action(
            &app,
            &format!("Delete {} item{} ({})?", resolved.len(), if resolved.len() == 1 { "" } else { "s" }, fmt(total)),
            &format!(
                "{}\n\n{}",
                lines.join("\n"),
                if backups {
                    "Agent backups are copies of your files from before a task. After this, that task can't be undone from its backup."
                } else {
                    "Caches only: each app rebuilds them as you use it."
                }
            ),
            "Delete",
            true,
        )?;
        let items = resolved.into_iter().map(|r| (r.label, r.paths)).collect();
        let result = delete_and_journal(&state, items, &home, &rules);
        if let Ok(mut last) = state.last_appdata.lock() {
            *last = None;
        }
        Ok(result)
    })
    .await
}
