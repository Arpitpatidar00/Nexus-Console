// Background health while the app sits in the tray (docs/remote/PLAN.md P7).
// Re-probes hosts that ALREADY have a live ssh master — it never opens a
// connection — every N minutes, and notifies only about critical findings
// that weren't there last time. Opt-in twice over: the user sets an interval
// AND the Servers module must be explicitly on. Settings are re-read every
// tick, like doctor::scheduler.

use super::findings::HostFinding;
use super::probe::HostSnapshot;
use super::{probe, ssh, with_host_lock, RemoteState};
use crate::doctor::Severity;
use std::collections::HashSet;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

const TICK: Duration = Duration::from_secs(60);

/// Fresh snapshots taken here, so an open Servers tab shows them too.
pub const SNAPSHOT_EVENT: &str = "remote://snapshot";

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SnapshotEvent<'a> {
    id: &'a str,
    snapshot: &'a HostSnapshot,
}

/// Minutes between background checks, or `None` = off. Fail-safe: missing,
/// zero or junk is off, and so is a settings file where Servers isn't
/// explicitly enabled (it's an opt-in module; see `settings::module_opted_in`).
pub fn interval(settings: Option<&serde_json::Value>) -> Option<Duration> {
    if !crate::settings::module_opted_in(settings, "remote") {
        return None;
    }
    let mins = settings?.get("remoteBackgroundMinutes")?.as_u64()?;
    (1..=24 * 60)
        .contains(&mins)
        .then(|| Duration::from_secs(mins * 60))
}

fn key(f: &HostFinding) -> (&'static str, Option<&str>) {
    (f.id, f.target.as_deref())
}

/// Critical findings in `next` that `prev` didn't have. With no previous
/// snapshot this is a first look, not news: nothing is "new".
pub fn new_criticals<'a>(
    prev: Option<&HostSnapshot>,
    next: &'a HostSnapshot,
) -> Vec<&'a HostFinding> {
    let Some(prev) = prev else {
        return vec![];
    };
    let before: HashSet<_> = prev
        .findings
        .iter()
        .filter(|f| f.severity == Severity::Red)
        .map(key)
        .collect();
    next.findings
        .iter()
        .filter(|f| f.severity == Severity::Red && !before.contains(&key(f)))
        .collect()
}

pub fn notification_body(label: &str, env_caps: &str, news: &[&HostFinding]) -> String {
    match news {
        [one] => format!("{label} ({env_caps}): {}", one.summary),
        many => format!("{} new critical issues on {label} ({env_caps})", many.len()),
    }
}

pub fn start(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut last: Option<Instant> = None;
        loop {
            if let Some(every) = interval(crate::settings::read(&app).as_ref()) {
                if last.is_none_or(|t| t.elapsed() >= every) {
                    run_once(&app);
                    last = Some(Instant::now());
                }
            }
            std::thread::sleep(TICK);
        }
    });
}

fn run_once(app: &tauri::AppHandle) {
    let state = app.state::<RemoteState>();
    let Ok(hosts) = state.read().map(|s| s.hosts.clone()) else {
        return;
    };
    for h in hosts {
        let Ok(target) = state.target(&h.id) else {
            continue;
        };
        if !ssh::control_check(&target) {
            continue; // not connected: never connect on the user's behalf
        }
        // Busy = the open tab is probing this host right now; skip a beat.
        let Ok(snap) = with_host_lock(&state, &h.id, || probe::run(&target)) else {
            continue;
        };
        let prev = state.snapshot(&h.id);
        let news = new_criticals(prev.as_ref(), &snap);
        if !news.is_empty() {
            let env = format!("{:?}", h.env).to_uppercase();
            notify(app, &notification_body(&h.label, &env, &news));
        }
        state.remember_snapshot(&h.id, &snap);
        let _ = app.emit(
            SNAPSHOT_EVENT,
            SnapshotEvent {
                id: &h.id,
                snapshot: &snap,
            },
        );
    }
}

fn notify(app: &tauri::AppHandle, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app
        .notification()
        .builder()
        .title("Nexus Servers")
        .body(body)
        .show();
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn snap(case: &str) -> HostSnapshot {
        let raw = std::fs::read_to_string(format!(
            "{}/../fixtures/remote/{case}/probe.txt",
            env!("CARGO_MANIFEST_DIR")
        ))
        .unwrap();
        probe::build(&raw, 0, 0).unwrap()
    }

    #[test]
    fn interval_is_opt_in_twice() {
        let on = json!({ "enabledModules": ["remote"], "remoteBackgroundMinutes": 15 });
        assert_eq!(interval(Some(&on)), Some(Duration::from_secs(900)));
        // Servers not explicitly on (missing list fails OPEN for other modules, not this one).
        assert_eq!(
            interval(Some(&json!({ "remoteBackgroundMinutes": 15 }))),
            None
        );
        assert_eq!(
            interval(Some(
                &json!({ "enabledModules": ["homebrew"], "remoteBackgroundMinutes": 15 })
            )),
            None
        );
        // Interval off / junk.
        assert_eq!(
            interval(Some(
                &json!({ "enabledModules": ["remote"], "remoteBackgroundMinutes": 0 })
            )),
            None
        );
        assert_eq!(
            interval(Some(
                &json!({ "enabledModules": ["remote"], "remoteBackgroundMinutes": "15" })
            )),
            None
        );
        assert_eq!(
            interval(Some(&json!({ "enabledModules": ["remote"] }))),
            None
        );
        assert_eq!(interval(None), None);
    }

    #[test]
    fn only_new_criticals_are_news() {
        let healthy = snap("ubuntu-24.04-docker");
        let broken = snap("container-restarting-unhealthy");
        // First look: a baseline, not a notification.
        assert!(new_criticals(None, &broken).is_empty());
        // Healthy → broken: crashy + sick are new (the failed unit is yellow).
        let news: Vec<_> = new_criticals(Some(&healthy), &broken)
            .iter()
            .map(|f| f.target.clone().unwrap())
            .collect();
        assert_eq!(news, ["nexus-testbed-crashy-1", "nexus-testbed-sick-1"]);
        // Still broken next time: nothing new, no repeat notification.
        assert!(new_criticals(Some(&broken), &broken).is_empty());
        // Recovery is never news.
        assert!(new_criticals(Some(&broken), &healthy).is_empty());
    }

    #[test]
    fn notification_copy() {
        let broken = snap("container-restarting-unhealthy");
        let reds: Vec<_> = broken
            .findings
            .iter()
            .filter(|f| f.severity == Severity::Red)
            .collect();
        assert_eq!(
            notification_body("Fameo API", "PROD", &reds[..1]),
            "Fameo API (PROD): nexus-testbed-crashy-1 keeps restarting (8 restarts)"
        );
        assert_eq!(
            notification_body("Fameo API", "PROD", &reds),
            "2 new critical issues on Fameo API (PROD)"
        );
    }
}
