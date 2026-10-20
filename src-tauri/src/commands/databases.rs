use super::blocking;
use crate::error::{AppError, AppResult};
use crate::services::databases::apfs::{self, DbSnapshot};
use crate::services::databases::classifier;
use crate::services::databases::discovery::{self, DiscoveredDb};
use crate::services::databases::store::{
    new_connection_id, DbConnection, QueryResult, TableSummary,
};
use crate::services::databases::DatabaseState;
use std::path::Path;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn db_discover_connections(_app: AppHandle) -> AppResult<Vec<DiscoveredDb>> {
    blocking(|| Ok(discovery::discover_local_databases())).await
}

#[tauri::command]
pub async fn db_list_connections(app: AppHandle) -> AppResult<Vec<DbConnection>> {
    blocking(move || {
        let state = app.state::<DatabaseState>();
        let store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("db store poisoned".into()))?;
        Ok(store.connections.clone())
    })
    .await
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddConnectionInput {
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

#[tauri::command]
pub async fn db_add_connection(
    app: AppHandle,
    input: AddConnectionInput,
) -> AppResult<DbConnection> {
    blocking(move || {
        let state = app.state::<DatabaseState>();
        let conn = DbConnection {
            id: new_connection_id(),
            name: input.name,
            driver: input.driver,
            host: input.host,
            port: input.port,
            user: input.user,
            database: input.database,
            tunnel_id: input.tunnel_id,
            allow_writes: input.allow_writes && input.env != "prod",
            env: input.env,
            data_dir: input.data_dir,
        };
        let mut store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("db store poisoned".into()))?;
        store.add(conn.clone());
        let dir = state.path.parent().unwrap_or(&state.path);
        store.save(dir)?;
        Ok(conn)
    })
    .await
}

#[tauri::command]
pub async fn db_remove_connection(app: AppHandle, id: String) -> AppResult<()> {
    blocking(move || {
        let state = app.state::<DatabaseState>();
        let mut store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("db store poisoned".into()))?;
        store
            .remove(&id)
            .ok_or_else(|| AppError::NotFound(format!("connection {id}")))?;
        let dir = state.path.parent().unwrap_or(&state.path);
        store.save(dir)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn db_introspect_schema(app: AppHandle, id: String) -> AppResult<Vec<TableSummary>> {
    blocking(move || {
        let state = app.state::<DatabaseState>();
        let store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("db store poisoned".into()))?;
        let conn = store
            .get(&id)
            .ok_or_else(|| AppError::NotFound(format!("connection {id}")))?;

        let mut tables = Vec::new();
        match conn.driver.as_str() {
            "postgres" => {
                let user = conn.user.as_deref().unwrap_or("postgres");
                let db = conn.database.as_deref().unwrap_or("postgres");
                let out = std::process::Command::new("psql")
                    .args([
                        "-h",
                        &conn.host,
                        "-p",
                        &conn.port.to_string(),
                        "-U",
                        user,
                        "-d",
                        db,
                        "-t",
                        "-c",
                        "SELECT table_name FROM information_schema.tables WHERE table_schema='public';",
                    ])
                    .output();
                if let Ok(o) = out {
                    for line in String::from_utf8_lossy(&o.stdout).lines() {
                        let name = line.trim();
                        if !name.is_empty() {
                            tables.push(TableSummary {
                                name: name.to_string(),
                                schema: "public".to_string(),
                                estimated_rows: 0,
                                size_pretty: "—".to_string(),
                            });
                        }
                    }
                }
            }
            "mysql" => {
                let user = conn.user.as_deref().unwrap_or("root");
                let db = conn.database.as_deref().unwrap_or("mysql");
                let out = std::process::Command::new("mysql")
                    .args([
                        "-h",
                        &conn.host,
                        "-P",
                        &conn.port.to_string(),
                        "-u",
                        user,
                        "-D",
                        db,
                        "-e",
                        "SHOW TABLES;",
                    ])
                    .output();
                if let Ok(o) = out {
                    for (i, line) in String::from_utf8_lossy(&o.stdout).lines().enumerate() {
                        if i > 0 && !line.trim().is_empty() {
                            tables.push(TableSummary {
                                name: line.trim().to_string(),
                                schema: db.to_string(),
                                estimated_rows: 0,
                                size_pretty: "—".to_string(),
                            });
                        }
                    }
                }
            }
            _ => {}
        }
        Ok(tables)
    })
    .await
}

#[tauri::command]
pub async fn db_run_query(app: AppHandle, id: String, query: String) -> AppResult<QueryResult> {
    blocking(move || {
        let state = app.state::<DatabaseState>();
        let store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("db store poisoned".into()))?;
        let conn = store
            .get(&id)
            .ok_or_else(|| AppError::NotFound(format!("connection {id}")))?;

        let sanitized = classifier::sanitize_and_classify_query(&query, conn.allow_writes)?;
        let start = std::time::Instant::now();

        let mut columns = Vec::new();
        let mut rows = Vec::new();

        match conn.driver.as_str() {
            "postgres" => {
                let user = conn.user.as_deref().unwrap_or("postgres");
                let db = conn.database.as_deref().unwrap_or("postgres");
                let out = std::process::Command::new("psql")
                    .args([
                        "-h",
                        &conn.host,
                        "-p",
                        &conn.port.to_string(),
                        "-U",
                        user,
                        "-d",
                        db,
                        "-c",
                        &sanitized,
                    ])
                    .output()
                    .map_err(|e| AppError::Io(format!("exec psql: {e}")))?;

                let text = String::from_utf8_lossy(&out.stdout);
                let lines: Vec<&str> = text
                    .lines()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .collect();
                if !lines.is_empty() {
                    columns = lines[0].split('|').map(|s| s.trim().to_string()).collect();
                    for line in lines.iter().skip(2) {
                        if line.starts_with('(') && line.contains("row") {
                            break;
                        }
                        let row_vals: Vec<serde_json::Value> = line
                            .split('|')
                            .map(|s| serde_json::Value::String(s.trim().to_string()))
                            .collect();
                        if row_vals.len() == columns.len() {
                            rows.push(row_vals);
                        }
                    }
                }
            }
            "redis" => {
                let out = std::process::Command::new("redis-cli")
                    .args([
                        "-h",
                        &conn.host,
                        "-p",
                        &conn.port.to_string(),
                        "SCAN",
                        "0",
                        "COUNT",
                        "100",
                    ])
                    .output()
                    .map_err(|e| AppError::Io(format!("exec redis-cli: {e}")))?;

                columns = vec!["Cursor".into(), "Key".into()];
                let text = String::from_utf8_lossy(&out.stdout);
                for line in text.lines().skip(1) {
                    let k = line.trim();
                    if !k.is_empty() {
                        rows.push(vec![
                            serde_json::Value::String("0".into()),
                            serde_json::Value::String(k.into()),
                        ]);
                    }
                }
            }
            _ => {
                columns = vec!["Result".into()];
                rows.push(vec![serde_json::Value::String(format!(
                    "Executed: {sanitized}"
                ))]);
            }
        }

        let duration_ms = start.elapsed().as_millis() as u64;
        let row_count = rows.len();

        Ok(QueryResult {
            columns,
            rows,
            row_count,
            duration_ms,
        })
    })
    .await
}

#[tauri::command]
pub async fn db_list_snapshots(data_dir: String) -> AppResult<Vec<DbSnapshot>> {
    blocking(move || Ok(apfs::list_snapshots(Path::new(&data_dir)))).await
}

#[tauri::command]
pub async fn db_create_snapshot(
    service_name: Option<String>,
    data_dir: String,
    label: String,
) -> AppResult<DbSnapshot> {
    blocking(move || apfs::create_snapshot(service_name.as_deref(), Path::new(&data_dir), &label))
        .await
}

#[tauri::command]
pub async fn db_restore_snapshot(
    service_name: Option<String>,
    data_dir: String,
    snapshot_path: String,
) -> AppResult<()> {
    blocking(move || {
        apfs::restore_snapshot(
            service_name.as_deref(),
            Path::new(&data_dir),
            Path::new(&snapshot_path),
        )
    })
    .await
}
