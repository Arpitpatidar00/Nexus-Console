pub mod apfs;
pub mod classifier;
pub mod discovery;
pub mod explorer;
pub mod store;

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
        Self {
            store: Mutex::new(store::DbStore::load(parent)),
            path,
            schema_semaphore: Arc::new(Semaphore::new(3)),
            password_cache: Mutex::new(HashMap::new()),
        }
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
