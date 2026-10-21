// One unified background scheduler for Stackroost (A-10 / PLAN.md E.5).
// Centralizes all periodic background jobs:
// 1. Remote health checks (remoteBackgroundMinutes)
// 2. Dead-man switch for production hosts (screen lock, sleep, idle timeout)
// 3. Mac Clean scheduled cleanup and low-disk alerts
// 4. Uptime monitors ping & SSL expiry warnings
// 5. Claude chat auto-archive (daily)
// 6. VSCode state.vscdb auto-vacuum when closed
//
// Pauses heavy tasks when their owning module is disabled or when the Mac is on low battery (<20% discharging).

use std::time::{Duration, Instant};
use tauri::AppHandle;

const TICK_INTERVAL: Duration = Duration::from_secs(10);

const BATTERY_RECHECK: Duration = Duration::from_secs(60);

/// Parse `pmset -g batt`: true only when discharging below 20%.
fn parse_battery_low(text: &str) -> bool {
    if !text.contains("discharging") {
        return false;
    }
    let Some(pct_idx) = text.find('%') else {
        return false;
    };
    let before = &text[..pct_idx];
    let start = before
        .rfind(|c: char| !c.is_ascii_digit())
        .map_or(0, |i| i + 1);
    before[start..].parse::<u32>().is_ok_and(|pct| pct < 20)
}

/// Is this Mac on low battery (< 20% and discharging)? Unknown counts as not low.
pub fn is_battery_low() -> bool {
    let opts = crate::core::exec::ExecOpts::default().with_timeout(Duration::from_secs(3));
    crate::core::exec::run("/usr/bin/pmset", &["-g", "batt"], opts)
        .is_ok_and(|out| parse_battery_low(&out.stdout_str))
}

/// Each job keeps the cadence it had as its own thread; the loop ticks at the
/// fastest of them (the dead-man switch) and runs the others when due.
const UPTIME_EVERY: Duration = Duration::from_secs(30);
const REMOTE_EVERY: Duration = Duration::from_secs(60);
const MACLEAN_EVERY: Duration = Duration::from_secs(5 * 60);
const DOCTOR_EVERY: Duration = Duration::from_secs(5 * 60);

fn due(last: &mut Option<Instant>, every: Duration) -> bool {
    if last.is_some_and(|t| t.elapsed() < every) {
        return false;
    }
    *last = Some(Instant::now());
    true
}

/// Start the single, unified background scheduler daemon.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        // Auto-connect any host marked `auto_connect: true` on startup
        crate::services::remote::background::auto_connect_all(&app);

        let mut last_deadman = Instant::now();
        let mut last_archive: Option<Instant> = None;
        let mut last_remote: Option<Instant> = None;
        let mut maclean_below = false;
        let mut last_maclean_clean: Option<Instant> = None;
        let (mut uptime_at, mut remote_at, mut maclean_at, mut doctor_at) =
            (None, None, None, None);
        // pmset is a process spawn; battery state changes slowly, so sample once a minute.
        let mut battery_low = false;
        let mut last_battery: Option<Instant> = None;

        loop {
            std::thread::sleep(TICK_INTERVAL);
            let settings = crate::settings::read(&app);
            let remote_on = crate::settings::module_opted_in(settings.as_ref(), "remote");

            // Dead-man switch is a safety control: it runs every tick, even on battery.
            if remote_on {
                crate::services::remote::deadman::tick(&app, &mut last_deadman);
            }

            // Low battery pauses everything else.
            if due(&mut last_battery, BATTERY_RECHECK) {
                battery_low = is_battery_low();
            }
            if battery_low {
                continue;
            }

            if due(&mut uptime_at, UPTIME_EVERY) {
                crate::services::domains::uptime::tick(&app);
            }
            if remote_on && due(&mut remote_at, REMOTE_EVERY) {
                crate::services::remote::background::tick(&app, &mut last_remote);
            }
            if crate::settings::module_enabled(settings.as_ref(), "maclean")
                && due(&mut maclean_at, MACLEAN_EVERY)
            {
                crate::services::maclean::background::tick(
                    &app,
                    &mut maclean_below,
                    &mut last_maclean_clean,
                );
            }
            // Each Doctor job checks its own opt-in (archive also needs Claude Chats on).
            if due(&mut doctor_at, DOCTOR_EVERY) {
                crate::services::doctor::scheduler::tick(&app, &mut last_archive);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn due_fires_first_time_then_waits() {
        let mut last = None;
        assert!(due(&mut last, Duration::from_secs(60)));
        assert!(!due(&mut last, Duration::from_secs(60)));
        assert!(due(&mut last, Duration::ZERO));
    }

    #[test]
    fn battery_low_only_when_discharging_under_20() {
        let low = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t15%; discharging; 0:40 remaining present: true";
        let ok = " -InternalBattery-0 (id=1)\t55%; discharging; 3:10 remaining present: true";
        let charging = " -InternalBattery-0 (id=1)\t12%; charging; 1:20 remaining present: true";
        let desktop = "Now drawing from 'AC Power'";
        assert!(parse_battery_low(low));
        assert!(!parse_battery_low(ok));
        assert!(!parse_battery_low(charging));
        assert!(!parse_battery_low(desktop));
    }
}
