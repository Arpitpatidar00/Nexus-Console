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
            home,
            user,
            brew_prefix: app.state::<AppContext>().brew_prefix.clone(),
            rules: &rules,
            cancel: &state.cancel,
        };
        scan::run(&inputs, &|p| {
            let _ = app.emit(PROGRESS_EVENT, &p);
        })
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
