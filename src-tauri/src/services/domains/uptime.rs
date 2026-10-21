use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

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
    #[serde(default)]
    pub last_ping_timestamp: Option<u64>,
    #[serde(default)]
    pub ssl_days_remaining: Option<i64>,
    #[serde(default)]
    pub last_cert_warn_timestamp: Option<u64>,
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
            if monitor.last_ping_timestamp.is_none() {
                monitor.last_ping_timestamp = self.monitors[pos].last_ping_timestamp;
            }
            if monitor.ssl_days_remaining.is_none() {
                monitor.ssl_days_remaining = self.monitors[pos].ssl_days_remaining;
            }
            if monitor.last_cert_warn_timestamp.is_none() {
                monitor.last_cert_warn_timestamp = self.monitors[pos].last_cert_warn_timestamp;
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
            m.last_ping_timestamp = Some(ping.timestamp);
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
    let opts =
        crate::core::exec::ExecOpts::default().with_timeout(std::time::Duration::from_secs(6));
    let out = crate::core::exec::run(
        "curl",
        &[
            "-s",
            "-L",
            "-o",
            "/dev/null",
            "-w",
            "%{http_code}",
            "-m",
            "5",
            "--",
            url,
        ],
        opts,
    );

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

fn notify_uptime(app: &tauri::AppHandle, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app
        .notification()
        .builder()
        .title("Stackroost Uptime")
        .body(body)
        .show();
}

pub const UPTIME_UPDATE_EVENT: &str = "uptime://update";

pub fn extract_domain_from_url(url: &str) -> Option<String> {
    let without_proto = if let Some(rest) = url.strip_prefix("https://") {
        rest
    } else if let Some(rest) = url.strip_prefix("http://") {
        rest
    } else {
        url
    };
    let host = without_proto.split('/').next()?.split(':').next()?;
    if host.is_empty() {
        None
    } else {
        Some(host.to_string())
    }
}

pub fn start_background_monitoring(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_secs(30));

            // Respect opt-in module setting (PLAN.md B.6)
            if !crate::settings::module_opted_in(crate::settings::read(&app).as_ref(), "domains") {
                continue;
            }

            let Ok(dir) = app.path().app_data_dir() else {
                continue;
            };

            let mut store = UptimeStore::load(&dir);
            if store.monitors.is_empty() {
                continue;
            }

            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);

            let mut changed = false;

            for monitor in &mut store.monitors {
                if !monitor.enabled {
                    continue;
                }

                let interval_secs = (monitor.interval_mins.max(1) as u64) * 60;
                let should_ping = match monitor.last_ping_timestamp {
                    Some(last) => now.saturating_sub(last) >= interval_secs,
                    None => true,
                };

                if !should_ping {
                    continue;
                }

                let was_up = monitor.is_up;
                let had_history = !monitor.history.is_empty();
                let ping = ping_target(&monitor.url);

                // Notify on down/up transition (B.6)
                if had_history && was_up && !ping.is_up {
                    notify_uptime(
                        &app,
                        &format!(
                            "⚠️ Monitor DOWN: {} ({}) is unreachable ({})",
                            monitor.name,
                            monitor.url,
                            ping.error.as_deref().unwrap_or("error")
                        ),
                    );
                } else if had_history && !was_up && ping.is_up {
                    notify_uptime(
                        &app,
                        &format!(
                            "✅ Monitor UP: {} ({}) is back online (HTTP {})",
                            monitor.name, monitor.url, ping.status_code
                        ),
                    );
                }

                // Check SSL certificate expiration if HTTPS
                if monitor.url.starts_with("https://") {
                    if let Some(domain) = extract_domain_from_url(&monitor.url) {
                        if let Ok(cert) = super::check_ssl(&domain, 443) {
                            monitor.ssl_days_remaining = Some(cert.days_remaining);

                            // Notify if certificate expires within 14 days (at most once every 24h)
                            if (0..=14).contains(&cert.days_remaining) {
                                let can_warn = match monitor.last_cert_warn_timestamp {
                                    Some(warn_t) => now.saturating_sub(warn_t) >= 86400,
                                    None => true,
                                };
                                if can_warn {
                                    notify_uptime(
                                        &app,
                                        &format!(
                                            "🔒 SSL Cert Expiring: {} ({domain}) expires in {} days!",
                                            monitor.name, cert.days_remaining
                                        ),
                                    );
                                    monitor.last_cert_warn_timestamp = Some(now);
                                }
                            }
                        }
                    }
                }

                monitor.is_up = ping.is_up;
                monitor.last_status = Some(ping.status_code);
                monitor.last_latency_ms = Some(ping.latency_ms);
                monitor.last_ping_timestamp = Some(now);
                monitor.history.insert(0, ping);
                monitor.history.truncate(50);

                if !monitor.history.is_empty() {
                    let up_count = monitor.history.iter().filter(|p| p.is_up).count();
                    monitor.uptime_percent_24h =
                        ((up_count as f64) / (monitor.history.len() as f64)) * 100.0;
                }

                changed = true;
            }

            if changed {
                let _ = store.save(&dir);
                let _ = app.emit(UPTIME_UPDATE_EVENT, &store.monitors);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_domain_from_url() {
        assert_eq!(
            extract_domain_from_url("https://example.com/api/v1"),
            Some("example.com".into())
        );
        assert_eq!(
            extract_domain_from_url("http://sub.test.org:8080/path"),
            Some("sub.test.org".into())
        );
        assert_eq!(
            extract_domain_from_url("example.com"),
            Some("example.com".into())
        );
    }

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
            last_ping_timestamp: None,
            ssl_days_remaining: None,
            last_cert_warn_timestamp: None,
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
