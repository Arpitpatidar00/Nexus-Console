use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DbGroup {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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
    #[serde(default)]
    pub group_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub row_count: usize,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DbCustomMapping {
    pub id: String,
    pub group_id: String,
    pub source_connection_id: String,
    pub source_schema: String,
    pub source_table: String,
    pub source_column: String,
    pub target_connection_id: String,
    pub target_schema: String,
    pub target_table: String,
    pub target_column: String,
    #[serde(default)]
    pub notes: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DbRejectedCandidate {
    pub id: String,
    pub group_id: String,
    pub source_connection_id: String,
    pub source_schema: String,
    pub source_table: String,
    pub source_column: String,
    pub target_connection_id: String,
    pub target_schema: String,
    pub target_table: String,
    pub target_column: String,
    pub created_at: u64,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbStore {
    #[serde(default)]
    pub groups: Vec<DbGroup>,
    pub connections: Vec<DbConnection>,
    #[serde(default)]
    pub custom_mappings: Vec<DbCustomMapping>,
    #[serde(default)]
    pub rejected_candidates: Vec<DbRejectedCandidate>,
}

fn random_u32() -> u32 {
    let mut buf = [0u8; 4];
    if let Ok(mut f) = std::fs::File::open("/dev/urandom") {
        use std::io::Read;
        let _ = f.read_exact(&mut buf);
    }
    u32::from_ne_bytes(buf)
}

pub fn new_connection_id() -> String {
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let rand = random_u32();
    format!("db_{t}_{rand:04x}")
}

pub fn new_group_id() -> String {
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let rand = random_u32();
    format!("grp_{t}_{rand:04x}")
}

pub fn new_mapping_id() -> String {
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let rand = random_u32();
    format!("map_{t}_{rand:04x}")
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

    pub fn update_connection(&mut self, conn: DbConnection) -> Option<DbConnection> {
        if let Some(c) = self.connections.iter_mut().find(|c| c.id == conn.id) {
            *c = conn.clone();
            Some(conn)
        } else {
            None
        }
    }

    pub fn remove(&mut self, id: &str) -> Option<DbConnection> {
        let removed = if let Some(pos) = self.connections.iter().position(|c| c.id == id) {
            Some(self.connections.remove(pos))
        } else {
            None
        };
        if removed.is_some() {
            self.custom_mappings
                .retain(|m| m.source_connection_id != id && m.target_connection_id != id);
            self.rejected_candidates
                .retain(|r| r.source_connection_id != id && r.target_connection_id != id);
        }
        removed
    }

    pub fn get(&self, id: &str) -> Option<&DbConnection> {
        self.connections.iter().find(|c| c.id == id)
    }

    pub fn add_group(&mut self, group: DbGroup) {
        self.groups.retain(|g| g.id != group.id);
        self.groups.push(group);
    }

    pub fn get_group(&self, id: &str) -> Option<&DbGroup> {
        self.groups.iter().find(|g| g.id == id)
    }

    pub fn update_group(
        &mut self,
        id: &str,
        name: String,
        description: Option<String>,
        color: Option<String>,
    ) -> Option<DbGroup> {
        if let Some(g) = self.groups.iter_mut().find(|g| g.id == id) {
            g.name = name;
            g.description = description;
            g.color = color;
            g.updated_at = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            Some(g.clone())
        } else {
            None
        }
    }

    /// Removes a group. If `delete_connections` is false, member connections
    /// are kept and moved to `groupId = None` (Ungrouped). If true, member
    /// connections are removed and their IDs are returned so their Keychain
    /// entries can be deleted.
    pub fn remove_group(
        &mut self,
        id: &str,
        delete_connections: bool,
    ) -> (Option<DbGroup>, Vec<String>) {
        let removed_group = if let Some(pos) = self.groups.iter().position(|g| g.id == id) {
            Some(self.groups.remove(pos))
        } else {
            None
        };

        let mut affected_conn_ids = Vec::new();
        if delete_connections {
            let mut retained = Vec::new();
            for c in self.connections.drain(..) {
                if c.group_id.as_deref() == Some(id) {
                    affected_conn_ids.push(c.id);
                } else {
                    retained.push(c);
                }
            }
            self.connections = retained;
        } else {
            for c in &mut self.connections {
                if c.group_id.as_deref() == Some(id) {
                    c.group_id = None;
                    affected_conn_ids.push(c.id.clone());
                }
            }
        }

        if removed_group.is_some() {
            self.custom_mappings.retain(|m| m.group_id != id);
            self.rejected_candidates.retain(|r| r.group_id != id);
        }

        (removed_group, affected_conn_ids)
    }

    pub fn move_connection(&mut self, id: &str, group_id: Option<String>) -> Option<DbConnection> {
        if let Some(c) = self.connections.iter_mut().find(|c| c.id == id) {
            let old_group = c.group_id.clone();
            c.group_id = group_id.clone();
            if old_group != group_id {
                // Remove custom mappings linked to other connections in the old group to prevent cross-group leakage
                self.custom_mappings
                    .retain(|m| m.source_connection_id != id && m.target_connection_id != id);
            }
            Some(c.clone())
        } else {
            None
        }
    }

    pub fn add_custom_mapping(&mut self, mapping: DbCustomMapping) {
        self.custom_mappings.retain(|m| m.id != mapping.id);
        self.custom_mappings.push(mapping);
    }

    pub fn remove_custom_mapping(&mut self, id: &str) -> Option<DbCustomMapping> {
        if let Some(pos) = self.custom_mappings.iter().position(|m| m.id == id) {
            Some(self.custom_mappings.remove(pos))
        } else {
            None
        }
    }

    pub fn list_custom_mappings(&self, group_id: Option<&str>) -> Vec<DbCustomMapping> {
        if let Some(gid) = group_id {
            self.custom_mappings
                .iter()
                .filter(|m| m.group_id == gid)
                .cloned()
                .collect()
        } else {
            self.custom_mappings.clone()
        }
    }

    pub fn add_rejected_candidate(&mut self, rejected: DbRejectedCandidate) {
        self.rejected_candidates.retain(|r| r.id != rejected.id);
        self.rejected_candidates.push(rejected);
    }

    pub fn remove_rejected_candidate(&mut self, id: &str) -> Option<DbRejectedCandidate> {
        if let Some(pos) = self.rejected_candidates.iter().position(|r| r.id == id) {
            Some(self.rejected_candidates.remove(pos))
        } else {
            None
        }
    }

    pub fn list_rejected_candidates(&self, group_id: Option<&str>) -> Vec<DbRejectedCandidate> {
        if let Some(gid) = group_id {
            self.rejected_candidates
                .iter()
                .filter(|r| r.group_id == gid)
                .cloned()
                .collect()
        } else {
            self.rejected_candidates.clone()
        }
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
            group_id: None,
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
        assert_eq!(store.connections[0].group_id, None);
        assert!(store.groups.is_empty());
    }

    #[test]
    fn new_connection_id_and_group_id_collision_resistance() {
        let mut conn_ids = std::collections::HashSet::new();
        let mut grp_ids = std::collections::HashSet::new();
        for _ in 0..100 {
            let cid = new_connection_id();
            let gid = new_group_id();
            assert!(cid.starts_with("db_"));
            assert!(gid.starts_with("grp_"));
            assert!(conn_ids.insert(cid), "duplicate connection id generated");
            assert!(grp_ids.insert(gid), "duplicate group id generated");
        }
    }

    #[test]
    fn group_crud_and_connection_move() {
        let mut store = DbStore::default();
        let grp = DbGroup {
            id: "grp_1".to_string(),
            name: "Fameo Workspace".to_string(),
            description: Some("Production cluster".to_string()),
            color: Some("#6366f1".to_string()),
            created_at: 1000,
            updated_at: 1000,
        };
        store.add_group(grp);
        assert_eq!(store.groups.len(), 1);
        assert_eq!(store.get_group("grp_1").unwrap().name, "Fameo Workspace");

        // Update group
        let updated = store
            .update_group("grp_1", "Fameo Prods".to_string(), None, None)
            .unwrap();
        assert_eq!(updated.name, "Fameo Prods");
        assert_eq!(updated.description, None);

        // Add connections (one with group_id, one without)
        let mut c1 = sample_conn("db_1", "Main DB", "postgres");
        c1.group_id = Some("grp_1".to_string());
        store.add(c1);

        let c2 = sample_conn("db_2", "Redis Cache", "redis");
        store.add(c2);

        // Move c2 to grp_1
        let moved = store.move_connection("db_2", Some("grp_1".to_string()));
        assert_eq!(moved.unwrap().group_id, Some("grp_1".to_string()));
        assert_eq!(
            store.get("db_2").unwrap().group_id,
            Some("grp_1".to_string())
        );

        // Remove group with delete_connections = false
        let (removed_grp, affected) = store.remove_group("grp_1", false);
        assert!(removed_grp.is_some());
        assert_eq!(affected.len(), 2);
        assert_eq!(store.get("db_1").unwrap().group_id, None);
        assert_eq!(store.get("db_2").unwrap().group_id, None);
        assert_eq!(store.connections.len(), 2);

        // Put c1 in new group, then remove group with delete_connections = true
        store.add_group(DbGroup {
            id: "grp_2".to_string(),
            name: "Temp Group".to_string(),
            description: None,
            color: None,
            created_at: 2000,
            updated_at: 2000,
        });
        store.move_connection("db_1", Some("grp_2".to_string()));
        let (removed_grp2, affected2) = store.remove_group("grp_2", true);
        assert!(removed_grp2.is_some());
        assert_eq!(affected2, vec!["db_1".to_string()]);
        assert!(store.get("db_1").is_none());
        assert!(store.get("db_2").is_some());
        assert_eq!(store.connections.len(), 1);
    }

    #[test]
    fn custom_mappings_and_rejections_lifecycle_and_reconciliation() {
        let mut store = DbStore::default();
        let map = DbCustomMapping {
            id: "map_1".to_string(),
            group_id: "grp_1".to_string(),
            source_connection_id: "db_auth".to_string(),
            source_schema: "public".to_string(),
            source_table: "users".to_string(),
            source_column: "id".to_string(),
            target_connection_id: "db_billing".to_string(),
            target_schema: "public".to_string(),
            target_table: "invoices".to_string(),
            target_column: "customer_id".to_string(),
            notes: Some("App logical reference".to_string()),
            created_at: 100,
            updated_at: 100,
        };
        store.add_custom_mapping(map.clone());
        assert_eq!(store.list_custom_mappings(Some("grp_1")).len(), 1);
        assert_eq!(store.list_custom_mappings(Some("grp_other")).len(), 0);

        let rej = DbRejectedCandidate {
            id: "rej_1".to_string(),
            group_id: "grp_1".to_string(),
            source_connection_id: "db_auth".to_string(),
            source_schema: "public".to_string(),
            source_table: "users".to_string(),
            source_column: "id".to_string(),
            target_connection_id: "db_legacy".to_string(),
            target_schema: "public".to_string(),
            target_table: "audit_logs".to_string(),
            target_column: "actor_id".to_string(),
            created_at: 100,
        };
        store.add_rejected_candidate(rej);
        assert_eq!(store.list_rejected_candidates(Some("grp_1")).len(), 1);

        // Connection removal cleans up mappings and rejections
        let mut c_auth = sample_conn("db_auth", "Auth DB", "postgres");
        c_auth.group_id = Some("grp_1".to_string());
        store.add(c_auth);
        let mut c_bill = sample_conn("db_billing", "Billing DB", "postgres");
        c_bill.group_id = Some("grp_1".to_string());
        store.add(c_bill);

        store.remove("db_auth");
        assert_eq!(store.list_custom_mappings(Some("grp_1")).len(), 0);
        assert_eq!(store.list_rejected_candidates(Some("grp_1")).len(), 0);

        // Test cross-group leakage prevention on move
        store.add_custom_mapping(map);
        assert_eq!(store.list_custom_mappings(Some("grp_1")).len(), 1);
        store.move_connection("db_billing", Some("grp_2".to_string()));
        // Moving db_billing to grp_2 removes cross-group mappings connected to it
        assert_eq!(store.list_custom_mappings(None).len(), 0);
    }
}
