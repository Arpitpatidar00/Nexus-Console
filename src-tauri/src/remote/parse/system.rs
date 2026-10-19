// `meta`, `uptime`, `cpu` and `reboot` sections.

use super::kv_lines;
use serde::Serialize;

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub hostname: String,
    /// os-release PRETTY_NAME, falling back to NAME + VERSION_ID.
    pub os: String,
    pub kernel: String,
    pub arch: String,
    pub uptime_secs: u64,
    pub reboot_required: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuInfo {
    pub cores: u32,
    pub usage_pct: Option<f64>,
    pub load1: f64,
    pub load5: f64,
    pub load15: f64,
}

fn unquote(v: &str) -> &str {
    v.trim().trim_matches('"').trim_matches('\'')
}

pub fn parse_system(meta: Option<&str>, uptime: Option<&str>, reboot: Option<&str>) -> SystemInfo {
    let meta = kv_lines(meta.unwrap_or(""));
    let up = kv_lines(uptime.unwrap_or(""));
    // `uname -srm` → "Linux 6.8.0-45-generic x86_64"
    let uname: Vec<&str> = meta
        .get("uname")
        .map_or(vec![], |u| u.split_whitespace().collect());
    let os = meta
        .get("PRETTY_NAME")
        .map(|v| unquote(v).to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| {
            let name = meta.get("NAME").map_or("", |v| unquote(v));
            let ver = meta.get("VERSION_ID").map_or("", |v| unquote(v));
            format!("{name} {ver}").trim().to_string()
        });
    SystemInfo {
        hostname: meta.get("hostname").unwrap_or(&"").to_string(),
        os,
        kernel: uname.get(1).unwrap_or(&"").to_string(),
        arch: uname.get(2).unwrap_or(&"").to_string(),
        uptime_secs: up
            .get("uptime")
            .and_then(|v| v.split_whitespace().next())
            .and_then(|v| v.parse::<f64>().ok())
            .map_or(0, |v| v as u64),
        reboot_required: reboot.is_some_and(|r| r.trim() == "yes"),
    }
}

pub fn parse_cpu(uptime: Option<&str>, stat: Option<&str>) -> CpuInfo {
    let up = kv_lines(uptime.unwrap_or(""));
    let load: Vec<f64> = up.get("loadavg").map_or(vec![], |l| {
        l.split_whitespace()
            .take(3)
            .filter_map(|v| v.parse().ok())
            .collect()
    });
    CpuInfo {
        cores: up.get("nproc").and_then(|v| v.parse().ok()).unwrap_or(0),
        usage_pct: stat.and_then(usage_pct),
        load1: load.first().copied().unwrap_or(0.0),
        load5: load.get(1).copied().unwrap_or(0.0),
        load15: load.get(2).copied().unwrap_or(0.0),
    }
}

/// `(idle, total)` jiffies from a `/proc/stat` `cpu` line. Idle includes
/// iowait; total is the first 8 fields (guest time is already in user/nice).
fn jiffies(line: &str) -> Option<(u64, u64)> {
    let mut it = line.split_whitespace();
    if it.next()? != "cpu" {
        return None;
    }
    let f: Vec<u64> = it.take(8).filter_map(|v| v.parse().ok()).collect();
    if f.len() < 5 {
        return None;
    }
    Some((f[3] + f[4], f.iter().sum()))
}

/// Busy share between the two samples, 0–100, rounded to 0.1.
fn usage_pct(stat: &str) -> Option<f64> {
    let samples: Vec<_> = stat.lines().filter_map(jiffies).collect();
    let [(i0, t0), (i1, t1)] = samples[..] else {
        return None;
    };
    let dt = t1.checked_sub(t0).filter(|d| *d > 0)? as f64;
    let di = i1.saturating_sub(i0) as f64;
    Some((((1.0 - di / dt) * 1000.0).round() / 10.0).clamp(0.0, 100.0))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cpu_usage_from_two_samples() {
        // Two real samples (Ubuntu 24.04 capture): Δtotal 401, Δidle 394 → 1.7%.
        let stat =
            "cpu  6601 0 2855 278630 2776 0 1443 0 0 0\ncpu  6604 0 2858 279024 2776 0 1444 0 0 0";
        assert_eq!(usage_pct(stat), Some(1.7));
        assert_eq!(usage_pct("cpu  1 2 3 4 5 6 7 8"), None);
        assert_eq!(usage_pct("cpu  1 0 0 1 0\ncpu  1 0 0 1 0"), None);
        assert_eq!(usage_pct("junk"), None);
    }

    #[test]
    fn os_falls_back_to_name_and_version() {
        let s = parse_system(
            Some("hostname=x\nNAME=\"Alpine Linux\"\nVERSION_ID=3.20.3"),
            None,
            None,
        );
        assert_eq!(s.os, "Alpine Linux 3.20.3");
        assert_eq!(s.kernel, "");
        assert!(!s.reboot_required);
    }

    #[test]
    fn empty_input_is_defaults() {
        assert_eq!(parse_cpu(None, None), CpuInfo::default());
        assert_eq!(parse_system(None, None, None).uptime_secs, 0);
    }
}
