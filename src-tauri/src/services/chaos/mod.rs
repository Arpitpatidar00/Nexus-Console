use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{watch, Mutex};

use crate::core::error::{AppError, AppResult};
use crate::core::validate::Port;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChaosProfile {
    pub latency_ms: u64,
    pub drop_rate_pct: u8,
    pub reject: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChaosProxyInfo {
    pub id: String,
    pub target_port: u16,
    pub chaos_port: u16,
    pub profile: ChaosProfile,
    pub active: bool,
}

struct ActiveProxy {
    info: ChaosProxyInfo,
    stop_tx: watch::Sender<bool>,
}

#[derive(Clone)]
pub struct ChaosManager {
    proxies: Arc<Mutex<HashMap<String, ActiveProxy>>>,
    running: Arc<AtomicBool>,
}

impl Default for ChaosManager {
    fn default() -> Self {
        Self {
            proxies: Arc::new(Mutex::new(HashMap::new())),
            running: Arc::new(AtomicBool::new(true)),
        }
    }
}

impl ChaosManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Start a real Tokio TCP chaos proxy on `127.0.0.1:<chaos_port>` forwarding to `127.0.0.1:<target_port>`.
    pub async fn start_proxy(
        &self,
        target_port: u16,
        chaos_port: u16,
        profile: ChaosProfile,
    ) -> AppResult<ChaosProxyInfo> {
        let _ = Port::try_from(target_port)?;
        let _ = Port::try_from(chaos_port)?;

        if target_port == chaos_port {
            return Err(AppError::InvalidName(
                "Chaos port must differ from target port".into(),
            ));
        }

        let proxy_id = format!("chaos_{chaos_port}");
        let mut map = self.proxies.lock().await;

        if let Some(existing) = map.remove(&proxy_id) {
            let _ = existing.stop_tx.send(true);
        }

        let listener = match TcpListener::bind(format!("127.0.0.1:{chaos_port}")).await {
            Ok(l) => l,
            Err(e) => {
                return Err(AppError::Io(format!(
                    "Failed to bind chaos proxy to 127.0.0.1:{chaos_port}: {e}"
                )));
            }
        };

        let (stop_tx, mut stop_rx) = watch::channel(false);
        let profile_clone = profile.clone();
        let target_addr = format!("127.0.0.1:{target_port}");

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = stop_rx.changed() => {
                        if *stop_rx.borrow() {
                            break;
                        }
                    }
                    accept_res = listener.accept() => {
                        match accept_res {
                            Ok((client_stream, _)) => {
                                let prof = profile_clone.clone();
                                let tgt = target_addr.clone();
                                tokio::spawn(async move {
                                    handle_client(client_stream, tgt, prof).await;
                                });
                            }
                            Err(_) => {
                                break;
                            }
                        }
                    }
                }
            }
        });

        let info = ChaosProxyInfo {
            id: proxy_id.clone(),
            target_port,
            chaos_port,
            profile,
            active: true,
        };

        map.insert(
            proxy_id,
            ActiveProxy {
                info: info.clone(),
                stop_tx,
            },
        );

        Ok(info)
    }

    /// Stop an active chaos proxy by id.
    pub async fn stop_proxy(&self, id: &str) -> AppResult<()> {
        let mut map = self.proxies.lock().await;
        if let Some(proxy) = map.remove(id) {
            let _ = proxy.stop_tx.send(true);
            Ok(())
        } else {
            Err(AppError::NotFound(format!("Chaos proxy {id} not found")))
        }
    }

    /// List all currently active chaos proxies.
    pub async fn list_proxies(&self) -> Vec<ChaosProxyInfo> {
        let map = self.proxies.lock().await;
        map.values().map(|p| p.info.clone()).collect()
    }

    /// Stop all running proxies immediately (called on application shutdown).
    pub async fn stop_all(&self) {
        self.running.store(false, Ordering::SeqCst);
        let mut map = self.proxies.lock().await;
        for (_, proxy) in map.drain() {
            let _ = proxy.stop_tx.send(true);
        }
    }

    /// Synchronous variant of stop_all for RunEvent::ExitRequested.
    pub fn stop_all_sync(&self) {
        self.running.store(false, Ordering::SeqCst);
        if let Ok(mut map) = self.proxies.try_lock() {
            for (_, proxy) in map.drain() {
                let _ = proxy.stop_tx.send(true);
            }
        }
    }
}

async fn handle_client(mut client_stream: TcpStream, target_addr: String, profile: ChaosProfile) {
    if profile.reject {
        let _ = client_stream.shutdown().await;
        return;
    }

    if profile.latency_ms > 0 {
        tokio::time::sleep(Duration::from_millis(profile.latency_ms)).await;
    }

    if profile.drop_rate_pct > 0 {
        let roll = (std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
            % 100) as u8;
        if roll < profile.drop_rate_pct {
            let _ = client_stream.shutdown().await;
            return;
        }
    }

    let Ok(mut target_stream) = TcpStream::connect(&target_addr).await else {
        let _ = client_stream.shutdown().await;
        return;
    };

    let (mut client_read, mut client_write) = client_stream.split();
    let (mut target_read, mut target_write) = target_stream.split();

    let client_to_target = async {
        let mut buf = [0u8; 8192];
        loop {
            match client_read.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    if target_write.write_all(&buf[..n]).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let _ = target_write.shutdown().await;
    };

    let target_to_client = async {
        let mut buf = [0u8; 8192];
        loop {
            match target_read.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    if client_write.write_all(&buf[..n]).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let _ = client_write.shutdown().await;
    };

    tokio::join!(client_to_target, target_to_client);
}

pub fn simulate_chaos(profile: &ChaosProfile) -> AppResult<bool> {
    if profile.reject {
        return Ok(false);
    }
    if profile.latency_ms > 0 {
        std::thread::sleep(Duration::from_millis(profile.latency_ms));
    }
    if profile.drop_rate_pct > 0 {
        let r = (std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
            % 100) as u8;
        if r < profile.drop_rate_pct {
            return Ok(false);
        }
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_chaos_proxy_forwarding() {
        // Start echo server on a random port
        let echo_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let target_port = echo_listener.local_addr().unwrap().port();

        tokio::spawn(async move {
            if let Ok((mut sock, _)) = echo_listener.accept().await {
                let mut buf = [0u8; 32];
                if let Ok(n) = sock.read(&mut buf).await {
                    let _ = sock.write_all(&buf[..n]).await;
                }
            }
        });

        let mgr = ChaosManager::new();
        // Bind chaos on port 0 by letting start_proxy pick or binding manually
        let chaos_bind = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let chaos_port = chaos_bind.local_addr().unwrap().port();
        drop(chaos_bind); // Free the port so chaos proxy can bind it

        let profile = ChaosProfile {
            latency_ms: 10,
            drop_rate_pct: 0,
            reject: false,
        };

        let proxy_info = mgr
            .start_proxy(target_port, chaos_port, profile)
            .await
            .unwrap();
        assert_eq!(proxy_info.chaos_port, chaos_port);

        // Connect through proxy
        let mut client = TcpStream::connect(format!("127.0.0.1:{chaos_port}"))
            .await
            .unwrap();
        client.write_all(b"ping").await.unwrap();

        let mut reply = [0u8; 4];
        client.read_exact(&mut reply).await.unwrap();
        assert_eq!(&reply, b"ping");

        // Stop proxy
        mgr.stop_proxy(&proxy_info.id).await.unwrap();
        assert!(mgr.list_proxies().await.is_empty());
    }

    #[tokio::test]
    async fn test_chaos_proxy_reject() {
        let mgr = ChaosManager::new();
        let chaos_bind = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let chaos_port = chaos_bind.local_addr().unwrap().port();
        drop(chaos_bind);

        let profile = ChaosProfile {
            latency_ms: 0,
            drop_rate_pct: 0,
            reject: true,
        };

        let info = mgr.start_proxy(8080, chaos_port, profile).await.unwrap();
        let mut client = TcpStream::connect(format!("127.0.0.1:{chaos_port}"))
            .await
            .unwrap();
        let mut buf = [0u8; 16];
        let n = client.read(&mut buf).await.unwrap();
        assert_eq!(
            n, 0,
            "Rejected connection must close immediately with 0 bytes"
        );

        mgr.stop_proxy(&info.id).await.unwrap();
    }
}
