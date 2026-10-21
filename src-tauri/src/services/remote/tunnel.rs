use crate::database::remote_store::{JournalEntry, TunnelConfig};
use crate::error::{AppError, AppResult};
use crate::services::remote::ssh::{self, SshTarget};
use crate::services::remote::RemoteState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::TcpListener;
use std::process::Child;
use std::sync::Mutex;
use std::time::SystemTime;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "state")]
pub enum TunnelState {
    Open,
    Reconnecting { attempt: u32 },
    Failed { reason: String },
    Closed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelStatus {
    pub config: TunnelConfig,
    pub state: TunnelState,
    pub is_multiplexed: bool,
    pub connection_template: String,
}

struct ActiveTunnel {
    target: SshTarget,
    spec: String,
    is_multiplexed: bool,
    child: Option<Child>,
}

#[derive(Default)]
pub struct TunnelManager {
    active: Mutex<HashMap<String, ActiveTunnel>>,
}

/// Always verify local port binds to loopback before forwarding.
pub fn check_local_port_free(port: u16) -> AppResult<()> {
    if port == 0 {
        return Err(AppError::InvalidName("port must be non-zero".into()));
    }
    match TcpListener::bind(("127.0.0.1", port)) {
        Ok(listener) => {
            drop(listener);
            Ok(())
        }
        Err(e) => Err(AppError::Conflict(format!(
            "Local port {port} is already in use: {e}"
        ))),
    }
}

pub fn forward_spec(local_port: u16, remote_host: &str, remote_port: u16) -> String {
    format!("127.0.0.1:{local_port}:{remote_host}:{remote_port}")
}

pub fn connection_template(config: &TunnelConfig) -> String {
    let port = config.local_port;
    let remote_port = config.remote_port;
    let name_lower = config.name.to_lowercase();

    if remote_port == 5432
        || remote_port == 5433
        || name_lower.contains("postgres")
        || name_lower.contains("pg")
    {
        format!("postgres://USER@127.0.0.1:{port}/DATABASE")
    } else if remote_port == 3306 || name_lower.contains("mysql") || name_lower.contains("mariadb")
    {
        format!("mysql://USER@127.0.0.1:{port}/DATABASE")
    } else if remote_port == 6379 || name_lower.contains("redis") {
        format!("redis://127.0.0.1:{port}")
    } else if remote_port == 27017 || name_lower.contains("mongo") {
        format!("mongodb://127.0.0.1:{port}/DATABASE")
    } else if remote_port == 80
        || remote_port == 443
        || remote_port == 8080
        || remote_port == 3000
        || name_lower.contains("http")
        || name_lower.contains("web")
    {
        format!("http://127.0.0.1:{port}")
    } else {
        format!("127.0.0.1:{port}")
    }
}

impl TunnelManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn open(&self, remote: &RemoteState, id: &str) -> AppResult<TunnelStatus> {
        let (tunnel, host) = {
            let s = remote.read()?;
            let t = s.tunnel(id)?.clone();
            let h = s.host(&t.host_id)?.clone();
            (t, h)
        };

        let mut active = self
            .active
            .lock()
            .map_err(|_| AppError::Io("tunnel lock poisoned".into()))?;

        if let Some(entry) = active.get_mut(id) {
            // Already active; verify it is still healthy
            if let Some(ref mut child) = entry.child {
                if let Ok(Some(_)) = child.try_wait() {
                    // child died, we will restart
                    active.remove(id);
                } else {
                    return Ok(TunnelStatus {
                        config: tunnel.clone(),
                        state: TunnelState::Open,
                        is_multiplexed: entry.is_multiplexed,
                        connection_template: connection_template(&tunnel),
                    });
                }
            } else if entry.is_multiplexed && ssh::control_check(&entry.target) {
                return Ok(TunnelStatus {
                    config: tunnel.clone(),
                    state: TunnelState::Open,
                    is_multiplexed: true,
                    connection_template: connection_template(&tunnel),
                });
            } else {
                active.remove(id);
            }
        }

        // Check local port loopback availability
        check_local_port_free(tunnel.local_port)?;

        let target = remote.target(&host.id)?;
        let spec = forward_spec(tunnel.local_port, &tunnel.remote_host, tunnel.remote_port);

        let is_multiplexed = ssh::control_check(&target);
        let child = if is_multiplexed {
            ssh::control_forward(&target, &spec)?;
            None
        } else {
            Some(ssh::spawn_tunnel(&target, &spec)?)
        };

        active.insert(
            id.to_string(),
            ActiveTunnel {
                target,
                spec: spec.clone(),
                is_multiplexed,
                child,
            },
        );

        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let _ = remote.write(|s| {
            s.append_journal(JournalEntry {
                at_epoch: now,
                host_id: host.id.clone(),
                host_label: host.label.clone(),
                env: host.env,
                action: "tunnel.open".into(),
                target: spec,
                result: "ok".into(),
                message: format!("Opened tunnel {}", tunnel.name),
            });
            Ok(())
        });

        Ok(TunnelStatus {
            config: tunnel.clone(),
            state: TunnelState::Open,
            is_multiplexed,
            connection_template: connection_template(&tunnel),
        })
    }

    pub fn close(&self, remote: &RemoteState, id: &str) -> AppResult<()> {
        let removed = {
            let mut active = self
                .active
                .lock()
                .map_err(|_| AppError::Io("tunnel lock poisoned".into()))?;
            active.remove(id)
        };

        let (tunnel, host) = {
            let s = remote.read()?;
            let t = s.tunnel(id).ok().cloned();
            let h = t.as_ref().and_then(|t| s.host(&t.host_id).ok()).cloned();
            (t, h)
        };

        if let Some(mut active) = removed {
            if active.is_multiplexed {
                let _ = ssh::control_cancel(&active.target, &active.spec);
            }
            if let Some(mut child) = active.child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }

        if let (Some(tunnel), Some(host)) = (tunnel, host) {
            let now = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();

            let _ = remote.write(|s| {
                s.append_journal(JournalEntry {
                    at_epoch: now,
                    host_id: host.id,
                    host_label: host.label,
                    env: host.env,
                    action: "tunnel.close".into(),
                    target: format!(
                        "127.0.0.1:{} -> {}:{}",
                        tunnel.local_port, tunnel.remote_host, tunnel.remote_port
                    ),
                    result: "ok".into(),
                    message: format!("Closed tunnel {}", tunnel.name),
                });
                Ok(())
            });
        }

        Ok(())
    }

    pub fn statuses(&self, remote: &RemoteState) -> AppResult<Vec<TunnelStatus>> {
        let tunnels = {
            let s = remote.read()?;
            s.tunnels.clone()
        };

        let mut active = self
            .active
            .lock()
            .map_err(|_| AppError::Io("tunnel lock poisoned".into()))?;

        let mut results = Vec::with_capacity(tunnels.len());

        for t in tunnels {
            let template = connection_template(&t);
            if let Some(entry) = active.get_mut(&t.id) {
                if let Some(ref mut child) = entry.child {
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            results.push(TunnelStatus {
                                config: t,
                                state: TunnelState::Failed {
                                    reason: format!("Process exited with status {status}"),
                                },
                                is_multiplexed: false,
                                connection_template: template,
                            });
                        }
                        Ok(None) => {
                            results.push(TunnelStatus {
                                config: t,
                                state: TunnelState::Open,
                                is_multiplexed: false,
                                connection_template: template,
                            });
                        }
                        Err(e) => {
                            results.push(TunnelStatus {
                                config: t,
                                state: TunnelState::Failed {
                                    reason: format!("Failed checking child: {e}"),
                                },
                                is_multiplexed: false,
                                connection_template: template,
                            });
                        }
                    }
                } else if entry.is_multiplexed {
                    if ssh::control_check(&entry.target) {
                        results.push(TunnelStatus {
                            config: t,
                            state: TunnelState::Open,
                            is_multiplexed: true,
                            connection_template: template,
                        });
                    } else {
                        results.push(TunnelStatus {
                            config: t,
                            state: TunnelState::Reconnecting { attempt: 1 },
                            is_multiplexed: true,
                            connection_template: template,
                        });
                    }
                } else {
                    results.push(TunnelStatus {
                        config: t,
                        state: TunnelState::Closed,
                        is_multiplexed: false,
                        connection_template: template,
                    });
                }
            } else {
                results.push(TunnelStatus {
                    config: t,
                    state: TunnelState::Closed,
                    is_multiplexed: false,
                    connection_template: template,
                });
            }
        }

        Ok(results)
    }

    pub fn shutdown_all(&self, _remote: &RemoteState) {
        let mut active = match self.active.lock() {
            Ok(g) => g,
            Err(_) => return,
        };

        for (_, mut entry) in active.drain() {
            if entry.is_multiplexed {
                let _ = ssh::control_cancel(&entry.target, &entry.spec);
            }
            if let Some(mut child) = entry.child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_forward_spec_format() {
        let spec = forward_spec(5433, "127.0.0.1", 5432);
        assert_eq!(spec, "127.0.0.1:5433:127.0.0.1:5432");
    }

    #[test]
    fn test_check_local_port_free() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let bound_port = listener.local_addr().unwrap().port();
        // Trying to check the port while still bound should report Conflict
        assert!(matches!(
            check_local_port_free(bound_port),
            Err(AppError::Conflict(_))
        ));

        drop(listener);
        // After dropping, port should be free
        assert!(check_local_port_free(bound_port).is_ok());
    }

    #[test]
    fn test_connection_templates() {
        let pg = TunnelConfig {
            id: "t1".into(),
            host_id: "h1".into(),
            name: "Production DB".into(),
            local_port: 5433,
            remote_host: "127.0.0.1".into(),
            remote_port: 5432,
            auto_start: false,
        };
        assert_eq!(
            connection_template(&pg),
            "postgres://USER@127.0.0.1:5433/DATABASE"
        );

        let redis = TunnelConfig {
            id: "t2".into(),
            host_id: "h1".into(),
            name: "Redis cache".into(),
            local_port: 6380,
            remote_host: "127.0.0.1".into(),
            remote_port: 6379,
            auto_start: false,
        };
        assert_eq!(connection_template(&redis), "redis://127.0.0.1:6380");

        let http = TunnelConfig {
            id: "t3".into(),
            host_id: "h1".into(),
            name: "Internal Web".into(),
            local_port: 8081,
            remote_host: "127.0.0.1".into(),
            remote_port: 80,
            auto_start: false,
        };
        assert_eq!(connection_template(&http), "http://127.0.0.1:8081");
    }

    #[test]
    fn test_status_json_serialization() {
        let status = TunnelStatus {
            config: TunnelConfig {
                id: "tun_123".into(),
                host_id: "h_456".into(),
                name: "API".into(),
                local_port: 3000,
                remote_host: "127.0.0.1".into(),
                remote_port: 3000,
                auto_start: true,
            },
            state: TunnelState::Open,
            is_multiplexed: true,
            connection_template: "http://127.0.0.1:3000".into(),
        };

        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains(r#""localPort":3000"#));
        assert!(json.contains(r#""state":"open""#));
        assert!(json.contains(r#""isMultiplexed":true"#));
    }
}
