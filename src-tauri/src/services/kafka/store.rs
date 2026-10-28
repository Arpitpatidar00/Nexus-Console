// Saved Kafka clusters. Passwords never land here — they live in the
// encrypted local vault next to it (`local-kafka-vault.json`).

use super::Security;
use crate::core::validate::{HostName, Port};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const FILE_NAME: &str = "local-kafka.json";
pub const VAULT_FILE_NAME: &str = "local-kafka-vault.json";
/// More seeds than this is a paste gone wrong, not a cluster.
const MAX_BOOTSTRAP: usize = 32;
const DEFAULT_PORT: u16 = 9092;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KafkaCluster {
    pub id: String,
    pub name: String,
    /// `host:port` seeds, normalized.
    pub bootstrap: Vec<String>,
    pub security: Security,
    #[serde(default)]
    pub sasl_mechanism: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
    /// PEM file with an extra CA to trust (self-hosted clusters with a private CA).
    #[serde(default)]
    pub ca_cert_path: Option<String>,
    pub env: String,
    pub created_at: u64,
    pub updated_at: u64,
    /// Filled in on every read from the vault; never trusted from disk.
    #[serde(default)]
    pub has_password: bool,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KafkaStore {
    #[serde(default)]
    pub clusters: Vec<KafkaCluster>,
}

impl KafkaStore {
    pub fn load(dir: &Path) -> KafkaStore {
        crate::core::store::load_store(dir.join(FILE_NAME))
    }

    pub fn save(&self, dir: &Path) -> AppResult<()> {
        crate::core::store::save_store(dir.join(FILE_NAME), self, true)
    }

    pub fn get(&self, id: &str) -> Option<&KafkaCluster> {
        self.clusters.iter().find(|c| c.id == id)
    }
}

pub fn new_cluster_id() -> String {
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let mut buf = [0u8; 4];
    ring::rand::SecureRandom::fill(&ring::rand::SystemRandom::new(), &mut buf)
        .expect("system random");
    format!("kafka_{t}_{:08x}", u32::from_ne_bytes(buf))
}

/// One seed: `host`, `host:port`, `[v6]:port`, or what people paste from a
/// client config (`SASL_SSL://host:port`).
fn parse_seed(seed: &str) -> AppResult<(String, u16)> {
    let s = seed
        .rsplit("://")
        .next()
        .unwrap_or(seed)
        .trim_end_matches('/');
    let (host, port) = if let Some(rest) = s.strip_prefix('[') {
        let (h, tail) = rest
            .split_once(']')
            .ok_or_else(|| AppError::InvalidName(format!("bad address: {seed}")))?;
        let port = match tail.strip_prefix(':') {
            Some(p) => Some(p),
            None if tail.is_empty() => None,
            None => return Err(AppError::InvalidName(format!("bad address: {seed}"))),
        };
        (h, port)
    } else if s.matches(':').count() > 1 {
        // A bare IPv6 literal has no room for a port.
        (s, None)
    } else {
        match s.split_once(':') {
            Some((h, p)) => (h, Some(p)),
            None => (s, None),
        }
    };
    let port = match port {
        Some(p) => p
            .parse::<u16>()
            .map_err(|_| AppError::InvalidName(format!("bad port in {seed}")))?,
        None => DEFAULT_PORT,
    };
    let host = HostName::try_from(host)?.as_str().to_string();
    let port = Port::try_from(port)?.as_u16();
    Ok((host, port))
}

/// Split on commas or whitespace, normalize, drop duplicates.
pub fn parse_bootstrap(input: &str) -> AppResult<Vec<(String, u16)>> {
    let mut out: Vec<(String, u16)> = Vec::new();
    for seed in input
        .split(|c: char| c == ',' || c.is_whitespace())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        let parsed = parse_seed(seed)?;
        if !out.contains(&parsed) {
            out.push(parsed);
        }
    }
    if out.is_empty() {
        return Err(AppError::InvalidName(
            "add at least one bootstrap server (host:port)".into(),
        ));
    }
    if out.len() > MAX_BOOTSTRAP {
        return Err(AppError::InvalidName(format!(
            "at most {MAX_BOOTSTRAP} bootstrap servers"
        )));
    }
    Ok(out)
}

pub fn format_seed((host, port): &(String, u16)) -> String {
    if host.contains(':') {
        format!("[{host}]:{port}")
    } else {
        format!("{host}:{port}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_common_bootstrap_shapes() {
        let got = parse_bootstrap(
            "localhost, broker-1.example.com:19092\nSASL_SSL://b2.example.com:9096 [::1]:9093 ::1",
        )
        .unwrap();
        assert_eq!(
            got,
            vec![
                ("localhost".into(), 9092),
                ("broker-1.example.com".into(), 19092),
                ("b2.example.com".into(), 9096),
                ("::1".into(), 9093),
                ("::1".into(), 9092),
            ]
        );
        assert_eq!(format_seed(&got[3]), "[::1]:9093");
    }

    #[test]
    fn dedupes_and_rejects_junk() {
        assert_eq!(
            parse_bootstrap("a:9092,a:9092,a").unwrap(),
            vec![("a".to_string(), 9092)]
        );
        assert!(parse_bootstrap("   ").is_err());
        assert!(parse_bootstrap("host:notaport").is_err());
        assert!(parse_bootstrap("host:0").is_err());
        assert!(parse_bootstrap("evil;rm -rf:9092").is_err());
        assert!(parse_bootstrap("[::1:9092").is_err());
        let many = (0..40)
            .map(|i| format!("h{i}:9092"))
            .collect::<Vec<_>>()
            .join(",");
        assert!(parse_bootstrap(&many).is_err());
    }
}
