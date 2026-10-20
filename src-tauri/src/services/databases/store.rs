use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbConnection {
    pub id: String,
    pub name: String,
    pub driver: String,
    pub host: String,
    pub port: u16,
    pub user: Option<String>,
    pub database: Option<String>,
    pub tunnel_id: Option<String>,
    pub allow_writes: bool,
    pub env: String,
    pub data_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableSummary {
    pub name: String,
    pub schema: String,
    pub estimated_rows: u64,
    pub size_pretty: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub row_count: usize,
    pub duration_ms: u64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbStore {
    pub connections: Vec<DbConnection>,
}

pub fn new_connection_id() -> String {
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("db_{t}")
}

impl DbStore {
    pub fn load(dir: &Path) -> DbStore {
        let path = dir.join("local-databases.json");
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, dir: &Path) -> AppResult<()> {
        let path = dir.join("local-databases.json");
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| AppError::Io(format!("serialize databases: {e}")))?;
        std::fs::write(&path, json)
            .map_err(|e| AppError::Io(format!("save databases to {}: {e}", path.display())))
    }

    pub fn add(&mut self, conn: DbConnection) {
        self.connections.retain(|c| c.id != conn.id);
        self.connections.push(conn);
    }

    pub fn remove(&mut self, id: &str) -> Option<DbConnection> {
        if let Some(pos) = self.connections.iter().position(|c| c.id == id) {
            Some(self.connections.remove(pos))
        } else {
            None
        }
    }

    pub fn get(&self, id: &str) -> Option<&DbConnection> {
        self.connections.iter().find(|c| c.id == id)
    }
}
