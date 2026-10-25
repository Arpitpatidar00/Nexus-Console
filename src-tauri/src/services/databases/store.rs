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

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_conn(id: &str, name: &str, driver: &str) -> DbConnection {
        DbConnection {
            id: id.to_string(),
            name: name.to_string(),
            driver: driver.to_string(),
            host: "127.0.0.1".to_string(),
            port: 5432,
            user: Some("postgres".to_string()),
            database: Some("testdb".to_string()),
            tunnel_id: None,
            allow_writes: false,
            env: "dev".to_string(),
            data_dir: None,
        }
    }

    #[test]
    fn empty_store_loads_default_and_saves() {
        let dir = std::env::temp_dir().join(format!("sr_db_store_empty_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let store = DbStore::load(&dir);
        assert!(store.connections.is_empty());

        let mut store = store;
        store.add(sample_conn("db_1", "Main DB", "postgres"));
        store.save(&dir).unwrap();

        let reloaded = DbStore::load(&dir);
        assert_eq!(reloaded.connections.len(), 1);
        assert_eq!(reloaded.connections[0].id, "db_1");
        assert_eq!(reloaded.connections[0].name, "Main DB");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn store_add_updates_existing_and_remove() {
        let mut store = DbStore::default();
        store.add(sample_conn("db_1", "Old Name", "postgres"));
        assert_eq!(store.get("db_1").unwrap().name, "Old Name");

        // Updating with same ID replaces it
        store.add(sample_conn("db_1", "New Name", "postgres"));
        assert_eq!(store.connections.len(), 1);
        assert_eq!(store.get("db_1").unwrap().name, "New Name");

        // Remove
        let removed = store.remove("db_1");
        assert!(removed.is_some());
        assert_eq!(removed.unwrap().name, "New Name");
        assert!(store.get("db_1").is_none());
        assert!(store.connections.is_empty());
    }

    #[test]
    fn store_deserializes_legacy_json_without_optional_fields() {
        let legacy_json = r#"{
            "connections": [
                {
                    "id": "db_legacy",
                    "name": "Legacy Postgres",
                    "driver": "postgres",
                    "host": "localhost",
                    "port": 5432,
                    "user": null,
                    "database": null,
                    "tunnelId": null,
                    "allowWrites": true,
                    "env": "dev",
                    "dataDir": null
                }
            ]
        }"#;
        let store: DbStore = serde_json::from_str(legacy_json).unwrap();
        assert_eq!(store.connections.len(), 1);
        assert_eq!(store.connections[0].id, "db_legacy");
        assert!(store.connections[0].allow_writes);
    }

    #[test]
    fn new_connection_id_starts_with_prefix() {
        let id1 = new_connection_id();
        assert!(id1.starts_with("db_"));
    }
}
