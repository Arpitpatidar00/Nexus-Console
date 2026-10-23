pub mod apfs;
pub mod classifier;
pub mod discovery;
pub mod explorer;
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
