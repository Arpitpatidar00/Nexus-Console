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

        let mut name = trimmed.to_string();
        let mut est_rows = 0;
        let mut size = "—".to_string();

        if trimmed.contains('|') {
            let parts: Vec<&str> = trimmed.split('|').map(str::trim).collect();
            if parts.len() >= 4 && parts[2].parse::<u64>().is_ok() {
                name = parts[0].to_string();
                est_rows = parts[2].parse().unwrap_or(0);
                size = parts[3].to_string();
            } else if parts.len() >= 2 {
                name = parts[1].to_string();
            } else {
                name = parts[0].to_string();
            }
        } else if trimmed.contains(',') {
            let parts = parse_csv_line(trimmed);
            if parts.len() >= 4 {
                name = parts[0].clone();
                est_rows = parts[2].parse().unwrap_or(0);
                size = parts[3].clone();
            } else if !parts.is_empty() {
                name = parts[0].clone();
            }
        }

        if !name.is_empty() {
            tables.push(store::TableSummary {
                name,
                schema: schema.to_string(),
                estimated_rows: est_rows,
                size_pretty: size,
            });
        }
    }
    tables
}

pub fn parse_mysql_tables(stdout: &str, schema: &str) -> Vec<store::TableSummary> {
    let mut tables = Vec::new();
    for line in stdout.lines().skip(1) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let parts: Vec<&str> = trimmed.split('\t').map(str::trim).collect();
        if parts.len() >= 4 {
            let name = parts[0];
            let est_rows = parts[2].parse().unwrap_or(0);
            let size = parts[3].to_string();
            tables.push(store::TableSummary {
                name: name.to_string(),
                schema: parts[1].to_string(),
                estimated_rows: est_rows,
                size_pretty: size,
            });
        } else {
            let name = parts[0];
            if !name.is_empty() {
                tables.push(store::TableSummary {
                    name: name.to_string(),
                    schema: schema.to_string(),
                    estimated_rows: 0,
                    size_pretty: "—".to_string(),
                });
            }
        }
    }
    tables
}
