// Tray automation for Mac Clean (docs/maclean/PLAN.md §5): an opt-in
// scheduled clean (the script's `--yes`) and an opt-in low-disk notification.
// Both off by default; settings re-read every tick, like doctor::scheduler.
// Never runs while a manual scan or clean holds the lock.

use super::catalog::{self, Env, ITEM_IDS};
use super::store::JournalEntry;
use super::{clean, disk, MacleanState};
use std::time::{Duration, Instant, SystemTime};
use tauri::Manager;

const TICK: Duration = Duration::from_secs(5 * 60);
const GIB: u64 = 1024 * 1024 * 1024;
/// Free space must climb this far back above the threshold before another
/// low-disk notification can fire.
const HYSTERESIS: u64 = GIB;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Automation {
    pub auto_clean_every: Option<Duration>,
    pub low_disk_below: Option<u64>,
}

/// Fail-safe: anything missing, zero or junk is OFF, and both need the Mac
/// Clean module switched on.
pub fn parse_settings(v: Option<&serde_json::Value>) -> Automation {
    if !crate::settings::module_enabled(v, "maclean") {
        return Automation::default();
    }
    let num = |k: &str| {
        v.and_then(|s| s.get(k))
            .and_then(serde_json::Value::as_u64)
            .filter(|n| *n > 0)
    };
    Automation {
        auto_clean_every: num("macleanAutoCleanDays")
            .filter(|d| *d <= 365)
            .map(|d| Duration::from_secs(d * 86_400)),
        low_disk_below: num("macleanLowDiskGb")
            .filter(|g| *g <= 1024)
            .map(|g| g * GIB),
    }
}

/// `(below now, notify)`. Notifies once per crossing, not on every tick.
pub fn low_disk(was_below: bool, free: u64, threshold: u64) -> (bool, bool) {
    if was_below {
        (free < threshold + HYSTERESIS, false)
    } else {
        let below = free < threshold;
        (below, below)
    }
}

/// Is a scheduled clean due? `last_auto` = newest automatic run in the journal.
pub fn auto_due(last_auto: Option<u64>, now: u64, every: Duration) -> bool {
    last_auto.is_none_or(|t| now.saturating_sub(t) >= every.as_secs())
}

pub fn start(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut below = false;
        let mut last_attempt: Option<Instant> = None;
        loop {
            let auto = parse_settings(crate::settings::read(&app).as_ref());
            if let Some(threshold) = auto.low_disk_below {
                if let Some(d) = disk::disk_stats() {
                    let (now_below, notify_now) = low_disk(below, d.free_bytes, threshold);
                    below = now_below;
                    if notify_now {
                        notify(
                            &app,
                            &format!(
                                "Only {} free on Macintosh HD. Open Mac Clean → Storage to see what you can get back.",
                                crate::doctor::vscode::fmt_mb(d.free_bytes)
                            ),
                        );
                    }
                }
            } else {
                below = false;
            }
            if let Some(every) = auto.auto_clean_every {
                // In-memory guard too: a run that found nothing to clean
                // writes no journal entry, and must not retry every tick.
                if last_attempt.is_none_or(|t| t.elapsed() >= every) {
                    if let Some(msg) = auto_clean(&app, every) {
                        notify(&app, &msg);
                    }
                    last_attempt = Some(Instant::now());
                }
            }
            std::thread::sleep(TICK);
        }
    });
}

/// One scheduled clean of the default-ticked items whose skip rules don't
/// hold. `None` when not due, busy, or nothing was freed (no notification).
fn auto_clean(app: &tauri::AppHandle, every: Duration) -> Option<String> {
    let state = app.state::<MacleanState>();
    let now = crate::doctor::claude::now_epoch();
    let last_auto = state
        .read()
        .ok()?
        .journal
        .iter()
        .find(|e| e.auto)
        .map(|e| e.at_epoch);
    if !auto_due(last_auto, now, every) {
        return None;
    }
    let _busy = state.scanning.try_lock().ok()?;
    let rules = state.read().ok()?.rules.clone();
    let env = Env {
        home: crate::doctor::paths::home()?,
        brew_prefix: app
            .state::<crate::context::AppContext>()
            .brew_prefix
            .clone(),
        rules: &rules,
        now: SystemTime::now(),
        cancel: &state.cancel,
    };
    let docker = catalog::docker_usage(&env);
    let before = disk::disk_stats()?.free_bytes;
    let (mut done, mut errors) = (Vec::new(), Vec::new());
    for id in ITEM_IDS {
        let item = catalog::measure_item(id, &env, &docker)?;
        if !item.default_selected || item.skip.is_some() || item.bytes == 0 {
            continue;
        }
        match clean::clean_item(id, &env, &docker, &app.state::<crate::brew::BrewLock>().0) {
            Ok(_) => done.push(item.label),
            Err(e) => errors.push(format!("{}: {e}", item.label)),
        }
    }
    if done.is_empty() && errors.is_empty() {
        return None;
    }
    if done.iter().any(|l| l.starts_with("Homebrew")) {
        app.state::<crate::commands::services::ServicesCache>()
            .invalidate();
    }
    std::thread::sleep(Duration::from_secs(2));
    let freed = disk::disk_stats().map_or(0, |d| d.free_bytes.saturating_sub(before));
    let _ = state.write(|s| {
        s.append_journal(JournalEntry {
            at_epoch: now,
            items: done,
            freed_bytes: freed,
            errors,
            auto: true,
        });
        Ok(())
    });
    (freed > 0).then(|| {
        format!(
            "Scheduled cleanup freed {}.",
            crate::doctor::vscode::fmt_mb(freed)
        )
    })
}

fn notify(app: &tauri::AppHandle, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app
        .notification()
        .builder()
        .title("Mac Clean")
        .body(body)
        .show();
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn settings_fail_safe_to_off() {
        assert_eq!(parse_settings(None), Automation::default());
        assert_eq!(parse_settings(Some(&json!({}))), Automation::default());
        let on = json!({ "macleanAutoCleanDays": 7, "macleanLowDiskGb": 10 });
        let a = parse_settings(Some(&on));
        assert_eq!(a.auto_clean_every, Some(Duration::from_secs(7 * 86_400)));
        assert_eq!(a.low_disk_below, Some(10 * GIB));
        // Module off → both off even when set.
        let off = json!({ "enabledModules": ["homebrew"], "macleanAutoCleanDays": 7, "macleanLowDiskGb": 10 });
        assert_eq!(parse_settings(Some(&off)), Automation::default());
        assert_eq!(
            parse_settings(Some(&json!({ "macleanAutoCleanDays": "7" }))).auto_clean_every,
            None
        );
        assert_eq!(
            parse_settings(Some(&json!({ "macleanAutoCleanDays": 0 }))).auto_clean_every,
            None
        );
    }

    #[test]
    fn low_disk_notifies_once_per_crossing() {
        let t = 10 * GIB;
        assert_eq!(low_disk(false, 20 * GIB, t), (false, false));
        assert_eq!(
            low_disk(false, 9 * GIB, t),
            (true, true),
            "crossing down notifies"
        );
        assert_eq!(
            low_disk(true, 8 * GIB, t),
            (true, false),
            "still low: no repeat"
        );
        assert_eq!(
            low_disk(true, t + GIB / 2, t),
            (true, false),
            "inside the margin: still low"
        );
        assert_eq!(low_disk(true, t + 2 * GIB, t), (false, false), "recovered");
        assert_eq!(
            low_disk(false, 9 * GIB, t),
            (true, true),
            "a new crossing notifies again"
        );
    }

    #[test]
    fn schedule() {
        let week = Duration::from_secs(7 * 86_400);
        assert!(auto_due(None, 1_000, week), "never ran: due");
        assert!(!auto_due(Some(1_000), 1_000 + 86_400, week));
        assert!(auto_due(Some(1_000), 1_000 + 7 * 86_400, week));
    }
}
