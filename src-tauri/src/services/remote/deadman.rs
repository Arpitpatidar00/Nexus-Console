// Dead-man's switch for production hosts (Roadmap v2 P1.1).
// While any `prod` host is connected:
// 1. Monitor screen lock (Darwin notification `com.apple.screenIsLocked`), system sleep,
//    and idle duration (settings: 5/10/30/0 mins, default 10).
// 2. If triggered: close idle control masters via `ssh -O exit` and journal the action.
// 3. Never kill a prod PTY if a foreground command is active; notify instead.

use crate::database::remote_store::{Env, JournalEntry};
use crate::services::pty::PtyManager;
use crate::services::remote::{ssh, RemoteState};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

pub const DEFAULT_IDLE_MINUTES: u64 = 10;
const SLEEP_LEAP_THRESHOLD: Duration = Duration::from_secs(25);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DisconnectReason {
    ScreenLocked,
    SystemSleep,
    IdleTimeout,
}

impl DisconnectReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ScreenLocked => "screen locked",
            Self::SystemSleep => "system sleep",
            Self::IdleTimeout => "idle timeout",
        }
    }
}

/// Pure evaluation for unit testing with an injectable clock.
pub fn should_disconnect(
    screen_locked: bool,
    system_slept: bool,
    idle_secs: u64,
    timeout_secs: Option<u64>,
) -> Option<DisconnectReason> {
    if screen_locked {
        return Some(DisconnectReason::ScreenLocked);
    }
    if system_slept {
        return Some(DisconnectReason::SystemSleep);
    }
    if let Some(limit) = timeout_secs {
        if limit > 0 && idle_secs >= limit {
            return Some(DisconnectReason::IdleTimeout);
        }
    }
    None
}

/// Setting: remoteDeadmanMinutes (default 10, 0 = off).
pub fn deadman_timeout_secs(settings: Option<&serde_json::Value>) -> Option<u64> {
    let mins = settings
        .and_then(|s| s.get("remoteDeadmanMinutes"))
        .and_then(|v| v.as_u64())
        .unwrap_or(DEFAULT_IDLE_MINUTES);
    if mins == 0 {
        None
    } else {
        Some(mins * 60)
    }
}

#[cfg(target_os = "macos")]
extern "C" {
    fn notify_register_check(name: *const libc::c_char, out_token: *mut libc::c_int) -> u32;
    fn notify_check(token: libc::c_int, check: *mut libc::c_int) -> u32;
}

#[cfg(target_os = "macos")]
pub fn check_screen_locked() -> bool {
    use std::sync::atomic::{AtomicI32, Ordering};
    static TOKEN: AtomicI32 = AtomicI32::new(-1);

    let mut token = TOKEN.load(Ordering::Relaxed);
    if token < 0 {
        let mut t = 0;
        let c_name = b"com.apple.screenIsLocked\0";
        let status =
            unsafe { notify_register_check(c_name.as_ptr() as *const libc::c_char, &mut t) };
        if status == 0 {
            TOKEN.store(t, Ordering::Relaxed);
            token = t;
        } else {
            return false;
        }
    }
    let mut check = 0;
    let status = unsafe { notify_check(token, &mut check) };
    status == 0 && check != 0
}

#[cfg(not(target_os = "macos"))]
pub fn check_screen_locked() -> bool {
    false
}

/// Are any prod-tagged hosts currently connected via SSH control master?
pub fn has_active_prod_host(state: &RemoteState) -> bool {
    let Ok(hosts) = state.read().map(|s| s.hosts.clone()) else {
        return false;
    };
    for h in hosts {
        if h.env == Env::Prod {
            if let Ok(target) = state.target(&h.id) {
                if ssh::control_check(&target) {
                    return true;
                }
            }
        }
    }
    false
}

/// Check and handle deadman triggers across all production hosts.
pub fn check_deadman_tick(
    app: &AppHandle,
    screen_locked: bool,
    system_slept: bool,
    now_epoch: u64,
) {
    let state = app.state::<RemoteState>();
    let pty_mgr = app.state::<PtyManager>();
    let Ok(hosts) = state.read().map(|s| s.hosts.clone()) else {
        return;
    };

    let settings = crate::settings::read(app);
    let timeout_secs = deadman_timeout_secs(settings.as_ref());

    for h in hosts {
        if h.env != Env::Prod {
            continue;
        }
        let Ok(target) = state.target(&h.id) else {
            continue;
        };
        if !ssh::control_check(&target) {
            continue;
        }

        let last_activity = pty_mgr.host_last_activity(&h.id).unwrap_or(now_epoch);
        let idle_secs = now_epoch.saturating_sub(last_activity);

        if let Some(reason) =
            should_disconnect(screen_locked, system_slept, idle_secs, timeout_secs)
        {
            // Check if PTY has an active foreground job
            if pty_mgr.host_has_foreground_job(&h.id) {
                notify(
                    app,
                    &format!(
                        "PROD session on {} is still running a command. (Recommended: use tmux for long prod jobs)",
                        h.label
                    ),
                );
                continue;
            }

            // Safe to auto-disconnect
            let _ = ssh::control_exit(&target);
            let _ = pty_mgr.kill_by_host(&h.id);

            let entry = JournalEntry {
                at_epoch: now_epoch,
                host_id: h.id.clone(),
                host_label: h.label.clone(),
                env: h.env,
                action: "disconnect".into(),
                target: "ssh".into(),
                result: "ok".into(),
                message: format!("Auto-disconnected ({})", reason.as_str()),
            };
            let _ = state.write(|s| {
                s.append_journal(entry);
                Ok(())
            });
        }
    }
}

pub fn tick(app: &AppHandle, last_tick: &mut Instant) {
    let now_inst = Instant::now();
    let slept = now_inst.duration_since(*last_tick) >= SLEEP_LEAP_THRESHOLD;
    *last_tick = now_inst;

    let locked = check_screen_locked();
    let now_epoch = crate::doctor::claude::now_epoch();

    check_deadman_tick(app, locked, slept, now_epoch);
}

fn notify(app: &AppHandle, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app
        .notification()
        .builder()
        .title("Stackroost Servers · PROD Safety")
        .body(body)
        .show();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn screen_lock_triggers_disconnect() {
        assert_eq!(
            should_disconnect(true, false, 0, Some(600)),
            Some(DisconnectReason::ScreenLocked)
        );
    }

    #[test]
    fn system_sleep_triggers_disconnect() {
        assert_eq!(
            should_disconnect(false, true, 0, Some(600)),
            Some(DisconnectReason::SystemSleep)
        );
    }

    #[test]
    fn idle_timeout_triggers_disconnect() {
        assert_eq!(
            should_disconnect(false, false, 601, Some(600)),
            Some(DisconnectReason::IdleTimeout)
        );
        assert_eq!(should_disconnect(false, false, 599, Some(600)), None);
    }

    #[test]
    fn timeout_off_disables_idle_trigger() {
        assert_eq!(should_disconnect(false, false, 99999, None), None);
    }

    #[test]
    fn parses_deadman_timeout_settings() {
        let json = serde_json::json!({ "remoteDeadmanMinutes": 5 });
        assert_eq!(deadman_timeout_secs(Some(&json)), Some(300));

        let json_zero = serde_json::json!({ "remoteDeadmanMinutes": 0 });
        assert_eq!(deadman_timeout_secs(Some(&json_zero)), None);

        assert_eq!(deadman_timeout_secs(None), Some(600)); // default 10m
    }
}
