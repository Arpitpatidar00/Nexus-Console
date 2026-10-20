use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UptimePing {
    pub timestamp: u64,
    pub status_code: u16,
    pub latency_ms: u64,
    pub is_up: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UptimeMonitor {
    pub id: String,
    pub name: String,
    pub url: String,
    pub interval_mins: u32,
    pub enabled: bool,
    pub last_status: Option<u16>,
    pub last_latency_ms: Option<u64>,
    pub is_up: bool,
    pub uptime_percent_24h: f64,
    pub history: Vec<UptimePing>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UptimeStore {
    pub monitors: Vec<UptimeMonitor>,
}

pub fn new_monitor_id() -> String {
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("mon_{t}")
}

impl UptimeStore {
    pub fn load(dir: &Path) -> UptimeStore {
        let path = dir.join("uptime-monitors.json");
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, dir: &Path) -> AppResult<()> {
        let path = dir.join("uptime-monitors.json");
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| AppError::Io(format!("serialize uptime: {e}")))?;
        std::fs::write(&path, json)
            .map_err(|e| AppError::Io(format!("save uptime monitors to {}: {e}", path.display())))
    }

    pub fn add_or_update(&mut self, mut monitor: UptimeMonitor) {
        if monitor.id.is_empty() {
            monitor.id = new_monitor_id();
        }
        if let Some(pos) = self.monitors.iter().position(|m| m.id == monitor.id) {
            if monitor.history.is_empty() {
                monitor.history = self.monitors[pos].history.clone();
            }
            self.monitors[pos] = monitor;
        } else {
            self.monitors.push(monitor);
        }
    }

    pub fn delete(&mut self, id: &str) {
        self.monitors.retain(|m| m.id != id);
    }

    pub fn record_ping(&mut self, id: &str, ping: UptimePing) {
        if let Some(m) = self.monitors.iter_mut().find(|m| m.id == id) {
            m.is_up = ping.is_up;
            m.last_status = Some(ping.status_code);
            m.last_latency_ms = Some(ping.latency_ms);
            m.history.insert(0, ping);
            m.history.truncate(50);

            if !m.history.is_empty() {
                let up_count = m.history.iter().filter(|p| p.is_up).count();
                m.uptime_percent_24h = ((up_count as f64) / (m.history.len() as f64)) * 100.0;
            }
        }
    }
}

pub fn ping_target(url: &str) -> UptimePing {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let t0 = Instant::now();
    let out = Command::new("/usr/bin/curl")
        .args([
            "-s",
            "-L",
            "-o",
            "/dev/null",
            "-w",
            "%{http_code}",
            "-m",
            "5",
            url,
        ])
        .output();

    let latency_ms = t0.elapsed().as_millis() as u64;

    match out {
        Ok(o) => {
            let code_str = String::from_utf8_lossy(&o.stdout).trim().to_string();
            let status_code = code_str.parse::<u16>().unwrap_or(0);
            let is_up = (200..400).contains(&status_code);
            UptimePing {
                timestamp: now,
                status_code,
                latency_ms,
                is_up,
                error: if is_up {
                    None
                } else {
                    Some(format!("HTTP {status_code}"))
                },
            }
        }
        Err(e) => UptimePing {
            timestamp: now,
            status_code: 0,
            latency_ms,
            is_up: false,
            error: Some(format!("Network error: {e}")),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_uptime_store_record_ping() {
        let mut store = UptimeStore::default();
        store.add_or_update(UptimeMonitor {
            id: "mon_1".into(),
            name: "Example".into(),
            url: "https://example.com".into(),
            interval_mins: 5,
            enabled: true,
            last_status: None,
            last_latency_ms: None,
            is_up: false,
            uptime_percent_24h: 100.0,
            history: vec![],
        });

        store.record_ping(
            "mon_1",
            UptimePing {
                timestamp: 1000,
                status_code: 200,
                latency_ms: 50,
                is_up: true,
                error: None,
            },
        );

        assert!(store.monitors[0].is_up);
        assert_eq!(store.monitors[0].last_status, Some(200));
        assert_eq!(store.monitors[0].history.len(), 1);
        assert_eq!(store.monitors[0].uptime_percent_24h, 100.0);
    }
}
