use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
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

pub struct ChaosManager {
    running: Arc<AtomicBool>,
}

impl Default for ChaosManager {
    fn default() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(true)),
        }
    }
}

impl ChaosManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn stop_all(&self) {
        self.running.store(false, Ordering::SeqCst);
    }
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

    #[test]
    fn test_simulate_chaos_reject() {
        let profile = ChaosProfile {
            latency_ms: 0,
            drop_rate_pct: 0,
            reject: true,
        };
        assert!(!simulate_chaos(&profile).unwrap());
    }

    #[test]
    fn test_simulate_chaos_latency() {
        let profile = ChaosProfile {
            latency_ms: 20,
            drop_rate_pct: 0,
            reject: false,
        };
        let t0 = std::time::Instant::now();
        assert!(simulate_chaos(&profile).unwrap());
        assert!(t0.elapsed().as_millis() >= 18);
    }
}
