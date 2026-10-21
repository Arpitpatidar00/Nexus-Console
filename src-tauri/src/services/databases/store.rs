use crate::error::AppResult;
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

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
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
        crate::core::store::load_store(dir.join("local-databases.json"))
    }

    pub fn save(&self, dir: &Path) -> AppResult<()> {
        crate::core::store::save_store(dir.join("local-databases.json"), self, true)
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
