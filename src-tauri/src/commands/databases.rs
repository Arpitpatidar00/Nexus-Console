use super::blocking;
use crate::core::exec::{self, ExecOpts};
use crate::core::mutation::{mutation, mutation_unattended, BlastRadius, MutationSpec};
use crate::core::validate::{DbName, DbUser, HostName, Port};
use crate::error::{AppError, AppResult};
use crate::services::databases::apfs::{self, DbSnapshot};
use crate::services::databases::classifier;
use crate::services::databases::discovery::{self, DiscoveredDb};
use crate::services::databases::store::{
    new_connection_id, DbConnection, QueryResult, TableSummary,
};
use crate::services::databases::DatabaseState;
use std::path::Path;
use std::time::Duration;
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
    // Validate inputs
    let _ = HostName::try_from(input.host.as_str())?;
    let _ = Port::try_from(input.port)?;
    if let Some(ref u) = input.user {
        let _ = DbUser::try_from(u.as_str())?;
    }
    if let Some(ref d) = input.database {
        let _ = DbName::try_from(d.as_str())?;
    }

    let _guard = mutation_unattended(
        MutationSpec::new(
            "Add DB Connection",
            format!(
                "Add connection {} ({}:{})",
                input.name, input.host, input.port
            ),
            "add_connection",
        )
        .blast_radius(BlastRadius::LocalIsolated)
        .target(&input.name),
    );

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
    let _guard = mutation_unattended(
        MutationSpec::new(
            "Remove DB Connection",
            format!("Remove connection {id}"),
            "remove_connection",
        )
        .blast_radius(BlastRadius::LocalIsolated)
        .target(&id)
        .destructive(true),
    );

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
        let conn = {
            let store = state
                .store
                .lock()
                .map_err(|_| AppError::Io("db store poisoned".into()))?;
            store
                .get(&id)
                .cloned()
                .ok_or_else(|| AppError::NotFound(format!("connection {id}")))?
        };

        let valid_host = HostName::try_from(conn.host.as_str())?;
        let valid_port = Port::try_from(conn.port)?;

        let mut tables = Vec::new();
        match conn.driver.as_str() {
            "postgres" => {
                let user = conn.user.as_deref().unwrap_or("postgres");
                let db = conn.database.as_deref().unwrap_or("postgres");
                let valid_user = DbUser::try_from(user)?;
                let valid_db = DbName::try_from(db)?;

                let opts = ExecOpts::default()
                    .with_timeout(Duration::from_secs(10))
                    .with_env(
                        "PGOPTIONS",
                        "-c default_transaction_read_only=on -c statement_timeout=10000",
                    );

                let out = exec::run(
                    "psql",
                    &[
                        "-h",
                        valid_host.as_str(),
                        "-p",
                        &valid_port.as_u16().to_string(),
                        "-U",
                        valid_user.as_str(),
                        "-d",
                        valid_db.as_str(),
                        "-t",
                        "-c",
                        "SELECT table_name FROM information_schema.tables WHERE table_schema='public';",
                    ],
                    opts,
                );

                if let Ok(o) = out {
                    tables = crate::services::databases::parse_psql_tables(
                        &String::from_utf8_lossy(&o.stdout),
                        "public",
                    );
                }
            }
            "mysql" => {
                let user = conn.user.as_deref().unwrap_or("root");
                let db = conn.database.as_deref().unwrap_or("mysql");
                let valid_user = DbUser::try_from(user)?;
                let valid_db = DbName::try_from(db)?;

                let opts = ExecOpts::default().with_timeout(Duration::from_secs(10));
                let out = exec::run(
                    "mysql",
                    &[
                        "-h",
                        valid_host.as_str(),
                        "-P",
                        &valid_port.as_u16().to_string(),
                        "-u",
                        valid_user.as_str(),
                        "-D",
                        valid_db.as_str(),
                        "--init-command=SET SESSION TRANSACTION READ ONLY; SET SESSION max_execution_time=10000;",
                        "-e",
                        "SHOW TABLES;",
                    ],
                    opts,
                );

                if let Ok(o) = out {
                    tables = crate::services::databases::parse_mysql_tables(
                        &String::from_utf8_lossy(&o.stdout),
                        db,
                    );
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
        let conn = {
            let store = state
                .store
                .lock()
                .map_err(|_| AppError::Io("db store poisoned".into()))?;
            store
                .get(&id)
                .cloned()
                .ok_or_else(|| AppError::NotFound(format!("connection {id}")))?
        };

        let valid_host = HostName::try_from(conn.host.as_str())?;
        let valid_port = Port::try_from(conn.port)?;

        let sanitized = classifier::sanitize_and_classify_query(&query, conn.allow_writes)?;
        let start = std::time::Instant::now();

        let mut columns = Vec::new();
        let mut rows = Vec::new();

        match conn.driver.as_str() {
            "postgres" => {
                let user = conn.user.as_deref().unwrap_or("postgres");
                let db = conn.database.as_deref().unwrap_or("postgres");
                let valid_user = DbUser::try_from(user)?;
                let valid_db = DbName::try_from(db)?;

                let opts = ExecOpts::default()
                    .with_timeout(Duration::from_secs(10))
                    .with_env(
                        "PGOPTIONS",
                        "-c default_transaction_read_only=on -c statement_timeout=10000",
                    );

                let out = exec::run(
                    "psql",
                    &[
                        "-h",
                        valid_host.as_str(),
                        "-p",
                        &valid_port.as_u16().to_string(),
                        "-U",
                        valid_user.as_str(),
                        "-d",
                        valid_db.as_str(),
                        "-c",
                        &sanitized,
                    ],
                    opts,
                )?;

                if !out.status.success() {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    return Err(AppError::Shell(format!("database query error: {stderr}")));
                }

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
            "mysql" => {
                let user = conn.user.as_deref().unwrap_or("root");
                let db = conn.database.as_deref().unwrap_or("mysql");
                let valid_user = DbUser::try_from(user)?;
                let valid_db = DbName::try_from(db)?;

                let opts = ExecOpts::default().with_timeout(Duration::from_secs(10));
                let out = exec::run(
                    "mysql",
                    &[
                        "-h",
                        valid_host.as_str(),
                        "-P",
                        &valid_port.as_u16().to_string(),
                        "-u",
                        valid_user.as_str(),
                        "-D",
                        valid_db.as_str(),
                        "--init-command=SET SESSION TRANSACTION READ ONLY; SET SESSION max_execution_time=10000;",
                        "-e",
                        &sanitized,
                    ],
                    opts,
                )?;

                if !out.status.success() {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    return Err(AppError::Shell(format!("database query error: {stderr}")));
                }

                let text = String::from_utf8_lossy(&out.stdout);
                let lines: Vec<&str> = text
                    .lines()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .collect();
                if !lines.is_empty() {
                    columns = lines[0].split('\t').map(|s| s.trim().to_string()).collect();
                    for line in lines.iter().skip(1) {
                        let row_vals: Vec<serde_json::Value> = line
                            .split('\t')
                            .map(|s| serde_json::Value::String(s.trim().to_string()))
                            .collect();
                        if row_vals.len() == columns.len() {
                            rows.push(row_vals);
                        }
                    }
                }
            }
            "redis" => {
                let opts = ExecOpts::default().with_timeout(Duration::from_secs(10));
                let out = exec::run(
                    "redis-cli",
                    &[
                        "-h",
                        valid_host.as_str(),
                        "-p",
                        &valid_port.as_u16().to_string(),
                        "SCAN",
                        "0",
                        "COUNT",
                        "100",
                    ],
                    opts,
                )?;

                if !out.status.success() {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    return Err(AppError::Shell(format!("redis error: {stderr}")));
                }

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
                return Err(AppError::InvalidName(format!(
                    "unsupported database driver: {}",
                    conn.driver
                )));
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
    _app: AppHandle,
    service_name: Option<String>,
    data_dir: String,
    label: String,
) -> AppResult<DbSnapshot> {
    let _guard = mutation_unattended(
        MutationSpec::new(
            "Create DB Snapshot",
            format!("Create snapshot for {data_dir}"),
            "create_snapshot",
        )
        .blast_radius(BlastRadius::LocalSystem)
        .target(&data_dir),
    );

    blocking(move || apfs::create_snapshot(service_name.as_deref(), Path::new(&data_dir), &label))
        .await
}

#[tauri::command]
pub async fn db_restore_snapshot(
    app: AppHandle,
    service_name: Option<String>,
    data_dir: String,
    snapshot_path: String,
) -> AppResult<()> {
    let _guard = mutation(
        &app,
        MutationSpec::new(
            "Restore DB Snapshot",
            format!("Restore database data directory {data_dir} from snapshot {snapshot_path}"),
            "restore_snapshot",
        )
        .blast_radius(BlastRadius::LocalSystem)
        .target(&snapshot_path)
        .destructive(true),
    )?;

    blocking(move || {
        apfs::restore_snapshot(
            service_name.as_deref(),
            Path::new(&data_dir),
            Path::new(&snapshot_path),
        )
    })
    .await
}
