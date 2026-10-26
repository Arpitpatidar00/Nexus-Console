pub mod apfs;
pub mod classifier;
pub mod discovery;
pub mod explorer;
pub mod store;
pub mod vault;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::Semaphore;

use std::collections::HashMap;

pub struct DatabaseState {
    pub path: PathBuf,
    pub store: Mutex<store::DbStore>,
    pub schema_semaphore: Arc<Semaphore>,
    pub password_cache: Mutex<HashMap<String, String>>,
}

impl DatabaseState {
    pub fn load(path: PathBuf) -> Self {
        let parent = path.parent().unwrap_or(&path);
        let store = store::DbStore::load(parent);
        let vault_file = parent.join("local-db-vault.json");
        let mut initial_passwords = vault::load_passwords(&vault_file);

        // One-time migration: for any existing connection without a cached password,
        // attempt to read it once from Keychain natively so existing connections
        // are seamlessly migrated into local-db-vault.
        let mut migrated = false;
        for conn in &store.connections {
            if !initial_passwords.contains_key(&conn.id) {
                if let Ok(Some(pass)) =
                    crate::core::keychain::get_password(&format!("db_conn_{}", conn.id))
                {
                    initial_passwords.insert(conn.id.clone(), pass);
                    migrated = true;
                }
            }
        }
        if migrated {
            let _ = vault::save_passwords(&vault_file, &initial_passwords);
        }

        Self {
            store: Mutex::new(store),
            path,
            schema_semaphore: Arc::new(Semaphore::new(3)),
            password_cache: Mutex::new(initial_passwords),
        }
    }

    pub fn save_password(&self, conn_id: &str, password: &str) {
        if let Ok(mut cache) = self.password_cache.lock() {
            cache.insert(conn_id.to_string(), password.to_string());
            let parent = self.path.parent().unwrap_or(&self.path);
            let vault_file = parent.join("local-db-vault.json");
            let _ = vault::save_passwords(&vault_file, &cache);
        }
        // Best effort sync to Keychain
        let _ = crate::core::keychain::set_password(&format!("db_conn_{conn_id}"), password);
    }

    pub fn remove_password(&self, conn_id: &str) {
        if let Ok(mut cache) = self.password_cache.lock() {
            cache.remove(conn_id);
            let parent = self.path.parent().unwrap_or(&self.path);
            let vault_file = parent.join("local-db-vault.json");
            let _ = vault::save_passwords(&vault_file, &cache);
        }
        let _ = crate::core::keychain::delete_password(&format!("db_conn_{conn_id}"));
    }
}

pub fn parse_csv_line(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();

    while let Some(c) = chars.next() {
        match c {
            '"' => {
                if in_quotes && chars.peek() == Some(&'"') {
                    current.push('"');
                    chars.next();
                } else {
                    in_quotes = !in_quotes;
                }
            }
            ',' if !in_quotes => {
                fields.push(current.trim().to_string());
                current = String::new();
            }
            _ => {
                current.push(c);
            }
        }
    }
    fields.push(current.trim().to_string());
    fields
}

pub fn parse_psql_csv(stdout: &str) -> (Vec<String>, Vec<Vec<serde_json::Value>>) {
    let mut lines = stdout.lines().filter(|l| !l.trim().is_empty());
    let mut columns = Vec::new();
    let mut rows = Vec::new();

    if let Some(header) = lines.next() {
        columns = parse_csv_line(header);
    }

    for line in lines {
        let fields = parse_csv_line(line);
        if !fields.is_empty() {
            let row_vals = fields.into_iter().map(serde_json::Value::String).collect();
            rows.push(row_vals);
        }
    }

    (columns, rows)
}

pub fn parse_mysql_tsv(stdout: &str) -> (Vec<String>, Vec<Vec<serde_json::Value>>) {
    let mut lines = stdout.lines().filter(|l| !l.trim().is_empty());
    let mut columns = Vec::new();
    let mut rows = Vec::new();

    if let Some(header) = lines.next() {
        columns = header.split('\t').map(|s| s.trim().to_string()).collect();
    }

    for line in lines {
        let fields: Vec<serde_json::Value> = line
            .split('\t')
            .map(|s| serde_json::Value::String(s.trim().to_string()))
            .collect();
        if !fields.is_empty() {
            rows.push(fields);
        }
    }

    (columns, rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_schema_semaphore_capacity() {
        let state = DatabaseState::load(PathBuf::from("/tmp/test-stackroost-db-store.json"));
        assert_eq!(state.schema_semaphore.available_permits(), 3);

        // Can acquire up to 3 permits
        let p1 = state.schema_semaphore.try_acquire().expect("permit 1");
        let p2 = state.schema_semaphore.try_acquire().expect("permit 2");
        let p3 = state.schema_semaphore.try_acquire().expect("permit 3");
        assert_eq!(state.schema_semaphore.available_permits(), 0);

        // 4th acquisition fails immediately without blocking
        assert!(state.schema_semaphore.try_acquire().is_err());

        // Dropping permits restores capacity
        drop(p1);
        drop(p2);
        drop(p3);
        assert_eq!(state.schema_semaphore.available_permits(), 3);
    }
}
