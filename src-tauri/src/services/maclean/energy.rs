// Per-process Energy Accounting & Power Source for Mac Clean (P9.2).
// Uses macOS proc_pid_rusage (flavor 4: RUSAGE_INFO_V4) for idle wakeups,
// interrupt wakeups, CPU time, and disk writes.
// Unplugged suggestions are strictly honest (no fake battery time saved).

use serde::{Deserialize, Serialize};
use std::process::Command;

#[repr(C)]
#[derive(Default, Debug, Clone, Copy)]
pub struct RusageInfoV4 {
    pub ri_uuid: [u8; 16],
    pub ri_user_time: u64,
    pub ri_system_time: u64,
    pub ri_pkg_idle_wkups: u64,
    pub ri_interrupt_wkups: u64,
    pub ri_pageins: u64,
    pub ri_wired_size: u64,
    pub ri_resident_size: u64,
    pub ri_phys_footprint: u64,
    pub ri_proc_start_abstime: u64,
    pub ri_proc_exit_abstime: u64,
    pub ri_child_user_time: u64,
    pub ri_child_system_time: u64,
    pub ri_child_pkg_idle_wkups: u64,
    pub ri_child_interrupt_wkups: u64,
    pub ri_child_pageins: u64,
    pub ri_child_elapsed_abstime: u64,
    pub ri_diskio_bytesread: u64,
    pub ri_diskio_byteswritten: u64,
    pub ri_cpu_time_qos_default: u64,
    pub ri_cpu_time_qos_maintenance: u64,
    pub ri_cpu_time_qos_background: u64,
    pub ri_cpu_time_qos_utility: u64,
    pub ri_cpu_time_qos_legacy: u64,
    pub ri_cpu_time_qos_user_initiated: u64,
    pub ri_cpu_time_qos_user_interactive: u64,
    pub ri_billed_system_time: u64,
    pub ri_serviced_system_time: u64,
    pub ri_logical_writes: u64,
    pub ri_lifetime_max_phys_footprint: u64,
    pub ri_instructions: u64,
    pub ri_cycles: u64,
    pub ri_billed_energy: u64,
    pub ri_serviced_energy: u64,
    pub ri_interval_max_phys_footprint: u64,
    pub ri_runnable_time: u64,
    pub _reserved: [u64; 16],
}

extern "C" {
    fn proc_pid_rusage(
        pid: libc::c_int,
        flavor: libc::c_int,
        buffer: *mut RusageInfoV4,
    ) -> libc::c_int;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnergyProcess {
    pub pid: i32,
    pub name: String,
    pub category: String, // "app" | "service" | "watcher" | "system"
    pub idle_wakeups: u64,
    pub interrupt_wakeups: u64,
    pub cpu_time_ms: u64,
    pub disk_write_bytes: u64,
    pub energy_impact_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnpluggedSuggestion {
    pub message: String,
    pub candidate_pids: Vec<i32>,
    pub candidate_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnergyReport {
    pub power_source: String, // "battery" | "ac"
    pub is_charging: bool,
    pub battery_percent: Option<u8>,
    pub processes: Vec<EnergyProcess>,
    pub unplugged_suggestion: Option<UnpluggedSuggestion>,
}

pub fn parse_pmset_batt(text: &str) -> (String, bool, Option<u8>) {
    let power_source = if text.contains("'Battery Power'") {
        "battery".to_string()
    } else {
        "ac".to_string()
    };

    let is_charging = text.contains("charging") && !text.contains("discharging");

    let mut percent = None;
    if let Some(idx) = text.find('%') {
        let prefix = &text[..idx];
        if let Some(num_str) = prefix.split_whitespace().last() {
            if let Ok(p) = num_str.parse::<u8>() {
                percent = Some(p);
            }
        }
    }

    (power_source, is_charging, percent)
}

/// Reads current power source via `pmset -g batt`.
pub fn read_power_source() -> (String, bool, Option<u8>) {
    let out = Command::new("pmset").args(["-g", "batt"]).output();
    let Ok(out) = out else {
        return ("ac".to_string(), false, None);
    };
    let text = String::from_utf8_lossy(&out.stdout);
    parse_pmset_batt(&text)
}

fn classify_process_category(comm: &str) -> &'static str {
    let lower = comm.to_lowercase();
    if lower.contains("/applications/") || lower.contains(".app/") {
        "app"
    } else if lower.contains("homebrew")
        || lower.contains("redis")
        || lower.contains("postgres")
        || lower.contains("mongod")
        || lower.contains("nginx")
        || lower.contains("mariadb")
    {
        "service"
    } else if lower.ends_with("node")
        || lower.ends_with("vite")
        || lower.ends_with("cargo")
        || lower.ends_with("rust-analyzer")
        || lower.ends_with("watchman")
        || lower.ends_with("esbuild")
        || lower.ends_with("webpack")
        || lower.ends_with("tsc")
        || lower.ends_with("deno")
        || lower.ends_with("bun")
        || lower.ends_with("python")
        || lower.ends_with("python3")
    {
        "watcher"
    } else {
        "system"
    }
}

pub fn sample_energy_report() -> EnergyReport {
    let (power_source, is_charging, battery_percent) = read_power_source();
    let my_uid = unsafe { libc::getuid() };

    let mut processes = Vec::new();

    // Query user processes via ps
    if let Ok(out) = Command::new("ps")
        .args(["-A", "-o", "pid,uid,comm"])
        .output()
    {
        let text = String::from_utf8_lossy(&out.stdout);
        for line in text.lines().skip(1) {
            let mut parts = line.split_whitespace();
            let Some(pid_str) = parts.next() else {
                continue;
            };
            let Some(uid_str) = parts.next() else {
                continue;
            };
            let comm = parts.collect::<Vec<_>>().join(" ");

            let Ok(pid) = pid_str.parse::<i32>() else {
                continue;
            };
            let Ok(uid) = uid_str.parse::<u32>() else {
                continue;
            };

            // Only report own user's processes
            if uid != my_uid || pid <= 1 {
                continue;
            }

            let mut ru = RusageInfoV4::default();
            let res = unsafe { proc_pid_rusage(pid, 4, &mut ru) };
            if res != 0 {
                continue;
            }

            let cpu_time_ms = (ru.ri_user_time + ru.ri_system_time) / 1_000_000;
            let idle_wakeups = ru.ri_pkg_idle_wkups;
            let interrupt_wakeups = ru.ri_interrupt_wkups;
            let disk_write_bytes = ru.ri_diskio_byteswritten;

            // Composite energy impact score (normalized heuristic)
            let energy_impact_score = (idle_wakeups as f64 * 0.1)
                + (interrupt_wakeups as f64 * 0.05)
                + (cpu_time_ms as f64 * 0.001);

            let comm_name = std::path::Path::new(&comm)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or(comm.clone());

            let category = classify_process_category(&comm).to_string();

            processes.push(EnergyProcess {
                pid,
                name: comm_name,
                category,
                idle_wakeups,
                interrupt_wakeups,
                cpu_time_ms,
                disk_write_bytes,
                energy_impact_score,
            });
        }
    }

    // Sort descending by energy impact score
    processes.sort_by(|a, b| {
        b.energy_impact_score
            .partial_cmp(&a.energy_impact_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let mut unplugged_suggestion = None;
    if power_source == "battery" {
        // Collect services or watchers waking CPU often
        let candidates: Vec<&EnergyProcess> = processes
            .iter()
            .filter(|p| {
                (p.category == "service" || p.category == "watcher")
                    && (p.idle_wakeups > 100 || p.cpu_time_ms > 5000)
            })
            .take(5)
            .collect();

        if !candidates.is_empty() {
            let count = candidates.len();
            let candidate_names: Vec<String> = candidates.iter().map(|p| p.name.clone()).collect();
            let candidate_pids: Vec<i32> = candidates.iter().map(|p| p.pid).collect();
            unplugged_suggestion = Some(UnpluggedSuggestion {
                message: format!(
                    "On battery: {count} background services/watchers are waking the CPU often. Pause them?"
                ),
                candidate_pids,
                candidate_names,
            });
        }
    }

    EnergyReport {
        power_source,
        is_charging,
        battery_percent,
        processes,
        unplugged_suggestion,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proc_pid_rusage_self() {
        let mut ru = RusageInfoV4::default();
        let my_pid = std::process::id() as i32;
        let res = unsafe { proc_pid_rusage(my_pid, 4, &mut ru) };
        assert_eq!(res, 0);
        assert!(ru.ri_user_time + ru.ri_system_time > 0);
    }

    #[test]
    fn test_classify_process_category() {
        assert_eq!(
            classify_process_category("/Applications/Visual Studio Code.app/Contents/MacOS/Code"),
            "app"
        );
        assert_eq!(
            classify_process_category("/opt/homebrew/opt/redis/bin/redis-server"),
            "service"
        );
        assert_eq!(classify_process_category("/usr/local/bin/node"), "watcher");
        assert_eq!(
            classify_process_category("/Users/me/.cargo/bin/rust-analyzer"),
            "watcher"
        );
        assert_eq!(classify_process_category("/usr/libexec/periodic"), "system");
    }
}
