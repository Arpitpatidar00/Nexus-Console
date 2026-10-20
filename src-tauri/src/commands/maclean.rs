// Mac Clean commands — thin wrappers over `crate::maclean`. The frontend sends
// nothing but "scan" / "cancel"; every path is resolved in Rust.

use super::{blocking, confirm_action};
use crate::context::AppContext;
use crate::error::{AppError, AppResult};
use crate::maclean::catalog::{self, Env};
use crate::maclean::clean::{self, CleanResult, ItemResult};
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
    blocking(move || {
        let state = app.state::<MacleanState>();
        let last = state
            .last_report
            .lock()
            .map_err(|_| AppError::Io("report lock poisoned".into()))?
            .clone()
            .ok_or_else(|| AppError::NotFound("Run a storage scan first.".into()))?;
        let raw = crate::maclean::deep::run()?;
        let me = std::env::var("USER").unwrap_or_default();
        Ok(crate::maclean::deep::build(
            &raw,
            &me,
            &last.map,
            last.disk.data_used_bytes,
        ))
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
        let listed = app
            .state::<MacleanState>()
            .last_report
            .lock()
            .map_err(|_| AppError::Io("report lock poisoned".into()))?
            .as_ref()
            .is_some_and(|r| r.large_files.iter().any(|f| f.path == path));
        if !listed {
            return Err(AppError::Forbidden(
                "Only files from the latest scan can be revealed.".into(),
            ));
        }
        std::process::Command::new("/usr/bin/open")
            .args(["-R", "--", &path])
            .status()
            .map_err(|e| AppError::Shell(format!("open failed: {e}")))?;
        Ok(())
    })
    .await
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
    _app: AppHandle,
) -> AppResult<crate::services::maclean::ghost::GhostScanReport> {
    blocking(move || {
        let home = crate::doctor::paths::home()
            .ok_or_else(|| AppError::NotFound("HOME not set".into()))?;
        Ok(crate::services::maclean::ghost::scan_ghost_leftovers(&home))
    })
    .await
}

#[tauri::command]
pub async fn maclean_ghost_clean(_app: AppHandle, ids: Vec<String>) -> AppResult<u64> {
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

#[tauri::command]
pub async fn maclean_pause_service(service_name: String) -> AppResult<()> {
    blocking(move || {
        if service_name.contains("homebrew")
            || service_name.contains("redis")
            || service_name.contains("postgres")
            || service_name.contains("nginx")
        {
            let _ = std::process::Command::new("brew")
                .args(["services", "stop", &service_name])
                .status();
        } else if let Ok(pid) = service_name.parse::<i32>() {
            let _ = std::process::Command::new("kill")
                .args(["-STOP", &pid.to_string()])
                .status();
        }
        Ok(())
    })
    .await
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
    _app: AppHandle,
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
        Ok(crate::services::maclean::duplicates::scan_duplicates(
            &target_dirs,
        ))
    })
    .await
}

#[tauri::command]
pub async fn maclean_duplicates_delete(_app: AppHandle, paths: Vec<String>) -> AppResult<u64> {
    blocking(move || {
        let home = crate::doctor::paths::home()
            .ok_or_else(|| AppError::NotFound("HOME not set".into()))?;
        crate::services::maclean::duplicates::delete_duplicates(&home, &paths).map_err(AppError::Io)
    })
    .await
}
