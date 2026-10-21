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
    pub password: Option<String>,
    pub database: Option<String>,
    pub tunnel_id: Option<String>,
    pub allow_writes: bool,
    pub env: String,
    pub data_dir: Option<String>,
}

#[tauri::command]
pub async fn db_set_password(id: String, password: String) -> AppResult<()> {
    crate::core::keychain::set_password(&format!("db_conn_{id}"), &password)
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

    let is_prod = input.env == "prod" || input.env == "production";
    let allow_writes = input.allow_writes && !is_prod;
    let password_opt = input.password.clone();

    blocking(move || {
        let state = app.state::<DatabaseState>();
        let conn_id = new_connection_id();

        if let Some(ref pass) = password_opt {
            let _ = crate::core::keychain::set_password(&format!("db_conn_{conn_id}"), pass);
        }

        let conn = DbConnection {
            id: conn_id,
            name: input.name,
            driver: input.driver,
            host: input.host,
            port: input.port,
            user: input.user,
            database: input.database,
            tunnel_id: input.tunnel_id,
            allow_writes,
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

    let _ = crate::core::keychain::delete_password(&format!("db_conn_{id}"));

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

fn resolve_endpoint(app: &AppHandle, conn: &DbConnection) -> (String, u16) {
    if let Some(ref tid) = conn.tunnel_id {
        if let Some(r_state) = app.try_state::<crate::services::remote::RemoteState>() {
            if let Ok(store) = r_state.read() {
                if let Some(t) = store.tunnels.iter().find(|t| &t.id == tid) {
                    return ("127.0.0.1".to_string(), t.local_port);
                }
            }
        }
    }
    (conn.host.clone(), conn.port)
}

fn get_conn_password(conn_id: &str) -> Option<String> {
    crate::core::keychain::get_password(&format!("db_conn_{conn_id}"))
        .ok()
        .flatten()
}

#[tauri::command]
pub async fn db_introspect_schema(app: AppHandle, id: String) -> AppResult<Vec<TableSummary>> {
    let app_clone = app.clone();
    blocking(move || {
        let state = app_clone.state::<DatabaseState>();
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

        let (endpoint_host, endpoint_port) = resolve_endpoint(&app_clone, &conn);
        let valid_host = HostName::try_from(endpoint_host.as_str())?;
        let valid_port = Port::try_from(endpoint_port)?;
        let pass = get_conn_password(&conn.id);

        let mut tables = Vec::new();
        match conn.driver.as_str() {
            "postgres" => {
                let user = conn.user.as_deref().unwrap_or("postgres");
                let db = conn.database.as_deref().unwrap_or("postgres");
                let valid_user = DbUser::try_from(user)?;
                let valid_db = DbName::try_from(db)?;

                let mut opts = ExecOpts::default()
                    .with_timeout(Duration::from_secs(10))
                    .with_env(
                        "PGOPTIONS",
                        "-c default_transaction_read_only=on -c statement_timeout=10000",
                    );
                if let Some(ref p) = pass {
                    opts = opts.with_env("PGPASSWORD", p);
                }

                // Query table name, schema, row estimates, and total size
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
                        "SELECT c.relname, n.nspname, c.reltuples::bigint, pg_size_pretty(pg_total_relation_size(c.oid)) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname;",
                    ],
                    opts.clone(),
                );

                let out = match out {
                    Ok(o) if o.status.success() => Ok(o),
                    _ => exec::run(
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
                    ),
                };

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

                let mut opts = ExecOpts::default().with_timeout(Duration::from_secs(10));
                if let Some(ref p) = pass {
                    opts = opts.with_env("MYSQL_PWD", p);
                }

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
                        "--batch",
                        "--raw",
                        "--init-command=SET SESSION TRANSACTION READ ONLY; SET SESSION max_execution_time=10000;",
                        "-e",
                        "SELECT TABLE_NAME, TABLE_SCHEMA, COALESCE(TABLE_ROWS, 0) AS estimated_rows, CONCAT(ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2), ' MB') AS size_pretty FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME;",
                    ],
                    opts.clone(),
                );

                let out = match out {
                    Ok(o) if o.status.success() => Ok(o),
                    _ => exec::run(
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
                    ),
                };

                if let Ok(o) = out {
                    tables = crate::services::databases::parse_mysql_tables(
                        &String::from_utf8_lossy(&o.stdout),
                        db,
                    );
                }
            }
            "redis" => {
                let port_str = valid_port.as_u16().to_string();
                let mut argv = vec![
                    "-h",
                    valid_host.as_str(),
                    "-p",
                    port_str.as_str(),
                ];
                if let Some(ref p) = pass {
                    argv.push("-a");
                    argv.push(p);
                }
                argv.extend(["SCAN", "0", "COUNT", "100"]);
                let opts = ExecOpts::default().with_timeout(Duration::from_secs(10));
                let out = exec::run("redis-cli", &argv, opts);
                if let Ok(o) = out {
                    let text = String::from_utf8_lossy(&o.stdout);
                    for line in text.lines().skip(1) {
                        let k = line.trim();
                        if !k.is_empty() {
                            tables.push(TableSummary {
                                name: k.to_string(),
                                schema: "redis".into(),
                                estimated_rows: 1,
                                size_pretty: "—".into(),
                            });
                        }
                    }
                }
            }
            "mongo" | "mongodb" => {
                let db = conn.database.as_deref().unwrap_or("admin");
                let port_str = valid_port.as_u16().to_string();
                let mut argv = vec![
                    "--host",
                    valid_host.as_str(),
                    "--port",
                    port_str.as_str(),
                    "--norc",
                    "--quiet",
                ];
                if let Some(ref u) = conn.user {
                    argv.push("-u");
                    argv.push(u);
                }
                if let Some(ref p) = pass {
                    argv.push("-p");
                    argv.push(p);
                }
                argv.extend([
                    "--eval",
                    "db.getCollectionNames().forEach(c => print(c))",
                ]);
                let opts = ExecOpts::default().with_timeout(Duration::from_secs(10));
                let out = exec::run("mongosh", &argv, opts);
                if let Ok(o) = out {
                    let text = String::from_utf8_lossy(&o.stdout);
                    for line in text.lines() {
                        let name = line.trim();
                        if !name.is_empty() {
                            tables.push(TableSummary {
                                name: name.to_string(),
                                schema: db.to_string(),
                                estimated_rows: 0,
                                size_pretty: "—".into(),
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
    let app_clone = app.clone();
    blocking(move || {
        let state = app_clone.state::<DatabaseState>();
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

        let (endpoint_host, endpoint_port) = resolve_endpoint(&app_clone, &conn);
        let valid_host = HostName::try_from(endpoint_host.as_str())?;
        let valid_port = Port::try_from(endpoint_port)?;
        let pass = get_conn_password(&conn.id);

        let is_prod = conn.env == "prod" || conn.env == "production";
        let allow_writes = conn.allow_writes && !is_prod;

        let sanitized = classifier::sanitize_and_classify_query(&query, allow_writes)?;
        let start = std::time::Instant::now();

        let (columns, rows) = match conn.driver.as_str() {
            "postgres" => {
                let user = conn.user.as_deref().unwrap_or("postgres");
                let db = conn.database.as_deref().unwrap_or("postgres");
                let valid_user = DbUser::try_from(user)?;
                let valid_db = DbName::try_from(db)?;

                let mut opts = ExecOpts::default().with_timeout(Duration::from_secs(10));
                if !allow_writes {
                    opts = opts.with_env(
                        "PGOPTIONS",
                        "-c default_transaction_read_only=on -c statement_timeout=10000",
                    );
                }
                if let Some(ref p) = pass {
                    opts = opts.with_env("PGPASSWORD", p);
                }

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
                        "--csv",
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
                crate::services::databases::parse_psql_csv(&text)
            }
            "mysql" => {
                let user = conn.user.as_deref().unwrap_or("root");
                let db = conn.database.as_deref().unwrap_or("mysql");
                let valid_user = DbUser::try_from(user)?;
                let valid_db = DbName::try_from(db)?;

                let mut opts = ExecOpts::default().with_timeout(Duration::from_secs(10));
                if let Some(ref p) = pass {
                    opts = opts.with_env("MYSQL_PWD", p);
                }

                let init_cmd = if !allow_writes {
                    "SET SESSION TRANSACTION READ ONLY; SET SESSION max_execution_time=10000;"
                } else {
                    "SET SESSION max_execution_time=10000;"
                };

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
                        "--batch",
                        "--raw",
                        &format!("--init-command={init_cmd}"),
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
                crate::services::databases::parse_mysql_tsv(&text)
            }
            "redis" => {
                let port_str = valid_port.as_u16().to_string();
                let mut argv = vec!["-h", valid_host.as_str(), "-p", port_str.as_str()];
                if let Some(ref p) = pass {
                    argv.push("-a");
                    argv.push(p);
                }
                argv.extend(["SCAN", "0", "COUNT", "100"]);
                let opts = ExecOpts::default().with_timeout(Duration::from_secs(10));
                let out = exec::run("redis-cli", &argv, opts)?;

                if !out.status.success() {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    return Err(AppError::Shell(format!("redis error: {stderr}")));
                }

                let columns = vec!["Cursor".into(), "Key".into()];
                let mut rows = Vec::new();
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
                (columns, rows)
            }
            "mongo" | "mongodb" => {
                let port_str = valid_port.as_u16().to_string();
                let mut argv = vec![
                    "--host",
                    valid_host.as_str(),
                    "--port",
                    port_str.as_str(),
                    "--norc",
                    "--quiet",
                ];
                if let Some(ref u) = conn.user {
                    argv.push("-u");
                    argv.push(u);
                }
                if let Some(ref p) = pass {
                    argv.push("-p");
                    argv.push(p);
                }
                argv.extend(["--eval", &sanitized]);
                let opts = ExecOpts::default().with_timeout(Duration::from_secs(10));
                let out = exec::run("mongosh", &argv, opts)?;

                if !out.status.success() {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    return Err(AppError::Shell(format!("mongodb error: {stderr}")));
                }

                let columns = vec!["Result".into()];
                let mut rows = Vec::new();
                let text = String::from_utf8_lossy(&out.stdout);
                for line in text.lines() {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        rows.push(vec![serde_json::Value::String(trimmed.to_string())]);
                    }
                }
                (columns, rows)
            }
            _ => {
                return Err(AppError::InvalidName(format!(
                    "unsupported database driver: {}",
                    conn.driver
                )));
            }
        };

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
