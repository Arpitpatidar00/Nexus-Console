// Kafka explorer: a read-only window onto the clusters you add — brokers,
// topics, partitions, configs, consumer groups and lag, and messages. The
// wire protocol is spoken natively (kafka-protocol + tokio), so there is no
// JVM, no kcat and no shell anywhere on this path.

pub mod client;
pub mod conn;
pub mod explorer;
pub mod payload;
pub mod scram;
pub mod store;

use crate::error::{AppError, AppResult};
use crate::services::databases::vault;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::sync::Semaphore;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Security {
    Plaintext,
    Ssl,
    SaslPlaintext,
    SaslSsl,
}

impl Security {
    pub fn tls(self) -> bool {
        matches!(self, Security::Ssl | Security::SaslSsl)
    }
    pub fn sasl(self) -> bool {
        matches!(self, Security::SaslPlaintext | Security::SaslSsl)
    }
}

pub const SASL_MECHANISMS: &[&str] = &["PLAIN", "SCRAM-SHA-256", "SCRAM-SHA-512"];

pub struct KafkaState {
    dir: PathBuf,
    pub store: Mutex<store::KafkaStore>,
    passwords: Mutex<HashMap<String, String>>,
    /// Cluster-wide reads fan out to every broker; a few at once is plenty.
    pub permits: Arc<Semaphore>,
}

impl KafkaState {
    pub fn load(dir: PathBuf) -> Self {
        Self {
            store: Mutex::new(store::KafkaStore::load(&dir)),
            passwords: Mutex::new(vault::load_passwords(&dir.join(store::VAULT_FILE_NAME))),
            dir,
            permits: Arc::new(Semaphore::new(4)),
        }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn password(&self, id: &str) -> Option<String> {
        self.passwords.lock().ok()?.get(id).cloned()
    }

    pub fn has_password(&self, id: &str) -> bool {
        self.passwords
            .lock()
            .map(|p| p.contains_key(id))
            .unwrap_or(false)
    }

    /// `Some("")` clears, `None` leaves the saved password alone.
    pub fn set_password(&self, id: &str, password: Option<&str>) -> AppResult<()> {
        let Some(password) = password else {
            return Ok(());
        };
        let mut map = self
            .passwords
            .lock()
            .map_err(|_| AppError::Io("kafka vault poisoned".into()))?;
        if password.is_empty() {
            map.remove(id);
        } else {
            map.insert(id.to_string(), password.to_string());
        }
        vault::save_passwords(&self.dir.join(store::VAULT_FILE_NAME), &map)
    }

    pub fn forget_password(&self, id: &str) -> AppResult<()> {
        self.set_password(id, Some(""))
    }
}

/// Kafka's numeric error codes, in words a person can act on.
pub fn error_text(code: i16) -> String {
    let s = match code {
        -1 => "the broker hit an unexpected error",
        1 => "offset out of range (the data was deleted by retention)",
        2 => "corrupt message",
        3 => "this topic or partition doesn't exist",
        5 => "the partition has no leader right now",
        6 => "the broker isn't the leader for this partition",
        7 => "the request timed out on the broker",
        8 => "the broker isn't available",
        9 => "a replica isn't available",
        14 => "the group coordinator is still loading",
        15 => "the group coordinator isn't available",
        16 => "this broker isn't the group's coordinator",
        29 => "not authorized to read this topic",
        30 => "not authorized to read this consumer group",
        31 => "not authorized to describe this cluster",
        33 => "the broker doesn't support this SASL mechanism",
        34 => "unexpected SASL state",
        35 => "the broker doesn't support this request version",
        41 => "this broker isn't the controller",
        42 => "invalid request",
        58 => "authentication failed",
        69 => "this consumer group doesn't exist",
        74 => "the leader epoch moved on",
        75 => "the leader epoch isn't known yet",
        _ => "",
    };
    if s.is_empty() {
        format!("Kafka error {code}")
    } else {
        format!("{s} (Kafka error {code})")
    }
}

pub fn kafka_error(code: i16, context: &str) -> AppError {
    let msg = format!("{context}: {}", error_text(code));
    match code {
        29..=31 | 33 | 34 | 58 => AppError::Forbidden(msg),
        3 | 69 => AppError::NotFound(msg),
        _ => AppError::Io(msg),
    }
}
