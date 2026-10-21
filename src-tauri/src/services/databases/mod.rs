pub mod apfs;
pub mod classifier;
pub mod discovery;
pub mod store;

use std::path::PathBuf;
use std::sync::Mutex;

pub struct DatabaseState {
    pub path: PathBuf,
    pub store: Mutex<store::DbStore>,
}

impl DatabaseState {
    pub fn load(path: PathBuf) -> Self {
        let parent = path.parent().unwrap_or(&path);
        Self {
            store: Mutex::new(store::DbStore::load(parent)),
            path,
        }
    }
}

pub fn parse_psql_tables(stdout: &str, schema: &str) -> Vec<store::TableSummary> {
    let mut tables = Vec::new();
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty()
            || trimmed.starts_with('(')
            || trimmed.contains("row")
            || trimmed.starts_with("---")
            || trimmed.starts_with("List of")
            || (trimmed.contains("Schema") && trimmed.contains("Name"))
        {
            continue;
        }

        let name = if trimmed.contains('|') {
            let parts: Vec<&str> = trimmed.split('|').map(str::trim).collect();
            if parts.len() >= 2 {
                parts[1]
            } else {
                parts[0]
            }
        } else {
            trimmed
        };

        if !name.is_empty() {
            tables.push(store::TableSummary {
                name: name.to_string(),
                schema: schema.to_string(),
                estimated_rows: 0,
                size_pretty: "—".to_string(),
            });
        }
    }
    tables
}

pub fn parse_mysql_tables(stdout: &str, schema: &str) -> Vec<store::TableSummary> {
    let mut tables = Vec::new();
    for line in stdout.lines().skip(1) {
        let name = line.trim();
        if !name.is_empty() {
            tables.push(store::TableSummary {
                name: name.to_string(),
                schema: schema.to_string(),
                estimated_rows: 0,
                size_pretty: "—".to_string(),
            });
        }
    }
    tables
}
