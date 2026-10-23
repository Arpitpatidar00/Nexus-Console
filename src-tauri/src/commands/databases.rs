use super::blocking;
use crate::core::exec::{self, ExecOpts};
use crate::core::mutation::{mutation, mutation_unattended, BlastRadius, MutationSpec};
use crate::core::validate::{DbName, DbUser, HostName, Port};
use crate::error::{AppError, AppResult};
use crate::services::databases::apfs::{self, DbSnapshot};
use crate::services::databases::classifier;
use crate::services::databases::discovery::{self, DiscoveredDb};
use crate::services::databases::explorer::{self, BrowsePage, BrowseRequest, DbSchema, Endpoint};
use crate::services::databases::store::{new_connection_id, DbConnection, QueryResult};
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
    blocking(move || {
        let state = app.state::<DatabaseState>();
        let name = state
            .store
            .lock()
            .map_err(|_| AppError::Io("db store poisoned".into()))?
            .connections
            .iter()
            .find(|c| c.id == id)
            .map(|c| c.name.clone())
            .ok_or_else(|| AppError::NotFound(format!("connection {id}")))?;
        // Confirm first — the Keychain password used to be deleted before
        // anything else, even when the removal then failed.
        let guard = mutation(
            &app,
            MutationSpec::new(
                format!("Remove “{name}”?"),
                "Stackroost forgets this connection and deletes its saved password from your Keychain. The database itself is not touched.",
                "Remove",
            )
            .blast_radius(BlastRadius::LocalIsolated)
            .target(&name)
            .destructive(true),
        )?;
        let mut store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("db store poisoned".into()))?;
        store
            .remove(&id)
            .ok_or_else(|| AppError::NotFound(format!("connection {id}")))?;
        let dir = state.path.parent().unwrap_or(&state.path);
        store.save(dir)?;
        drop(store);
        if let Err(e) = crate::core::keychain::delete_password(&format!("db_conn_{id}")) {
            guard.failure(format!("removed, but Keychain entry not deleted: {e}"));
        } else {
            guard.success("removed");
        }
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

/// The saved connection as something the explorer can dial: its tunnel's
/// local port if it has one, and its Keychain password.
fn endpoint_of(app: &AppHandle, id: &str) -> AppResult<Endpoint> {
    let state = app.state::<DatabaseState>();
    let conn = state
        .store
        .lock()
        .map_err(|_| AppError::Io("db store poisoned".into()))?
        .get(id)
        .cloned()
        .ok_or_else(|| AppError::NotFound(format!("connection {id}")))?;
    let (host, port) = resolve_endpoint(app, &conn);
    let host = HostName::try_from(host.as_str())?.as_str().to_string();
    let port = Port::try_from(port)?.as_u16();
    if let Some(u) = conn.user.as_deref() {
        DbUser::try_from(u)?;
    }
    if let Some(d) = conn.database.as_deref() {
        DbName::try_from(d)?;
    }
    Ok(Endpoint {
        password: get_conn_password(&conn.id),
        driver: conn.driver,
        host,
        port,
        user: conn.user,
        database: conn.database,
    })
}

/// Everything about a database in one read: tables, columns, keys, indexes
/// and foreign keys. Read-only on every engine.
#[tauri::command]
pub async fn db_schema(app: AppHandle, id: String) -> AppResult<DbSchema> {
    blocking(move || explorer::schema(&endpoint_of(&app, &id)?)).await
}

/// One page of rows, filtered and sorted, plus how many match.
#[tauri::command]
pub async fn db_browse(
    app: AppHandle,
    id: String,
    request: BrowseRequest,
) -> AppResult<BrowsePage> {
    blocking(move || explorer::browse(&endpoint_of(&app, &id)?, &request)).await
}

const EXPORT_EXTENSIONS: &[&str] = &["svg", "png", "mmd", "md", "json", "csv", "txt"];
const EXPORT_MAX_BYTES: usize = 64 * 1024 * 1024;

/// Save an export (a diagram, rows) to ~/Downloads under a name the frontend
/// suggests but Rust checks; `base64` carries binary data such as a PNG.
#[tauri::command]
pub async fn db_save_export(file_name: String, data: String, base64: bool) -> AppResult<String> {
    let guard = mutation_unattended(
        MutationSpec::new(
            "Save export",
            format!("Save {file_name} to ~/Downloads"),
            "db_save_export",
        )
        .blast_radius(BlastRadius::LocalIsolated)
        .target(&file_name),
    );
    blocking(move || {
        let ext = file_name
            .rsplit_once('.')
            .map(|(_, e)| e.to_ascii_lowercase());
        let ok_name = file_name.chars().count() <= 120
            && !file_name.starts_with('.')
            && !file_name
                .chars()
                .any(|c| c.is_control() || c == '/' || c == ':')
            && ext
                .as_deref()
                .is_some_and(|e| EXPORT_EXTENSIONS.contains(&e));
        if !ok_name {
            return Err(AppError::InvalidName(format!(
                "can't save as {file_name:?}"
            )));
        }
        let bytes = if base64 {
            crate::core::util::downloads::decode_base64(&data)?
        } else {
            data.into_bytes()
        };
        if bytes.len() > EXPORT_MAX_BYTES {
            return Err(AppError::InvalidName("export is larger than 64 MB".into()));
        }
        let path = crate::core::util::downloads::destination(&file_name)?;
        std::fs::write(&path, bytes).map_err(|e| {
            guard.failure(e.to_string());
            AppError::Io(format!("couldn't save {}: {e}", path.display()))
        })?;
        guard.success(path.display().to_string());
        Ok(path.display().to_string())
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

        // Redis speaks its own command language — the SQL classifier rejected
        // `GET key` outright — so it gets its own rules below.
        let is_redis = conn.driver == "redis";
        let sanitized = if is_redis {
            String::new()
        } else {
            classifier::sanitize_and_classify_query(&query, allow_writes)?
        };
        let start = std::time::Instant::now();

        let (columns, rows) = match conn.driver.as_str() {
            "postgres" => {
                let db = conn.database.as_deref().unwrap_or("postgres");
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

                let port = valid_port.as_u16().to_string();
                let mut argv = vec![
                    "-X",
                    "-h",
                    valid_host.as_str(),
                    "-p",
                    &port,
                    "-d",
                    valid_db.as_str(),
                ];
                // No user: psql's default (the macOS user) — what Homebrew's Postgres has.
                if let Some(u) = conn.user.as_deref().filter(|u| !u.is_empty()) {
                    DbUser::try_from(u)?;
                    argv.extend(["-U", u]);
                }
                argv.extend(["--csv", "-c", &sanitized]);
                let out = exec::run("psql", &argv, opts)?;

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
                let cmd_argv = classifier::classify_redis(&query, allow_writes)?;
                let port_str = valid_port.as_u16().to_string();
                let mut argv: Vec<&str> = vec![
                    "-h",
                    valid_host.as_str(),
                    "-p",
                    port_str.as_str(),
                    "--no-raw",
                ];
                argv.extend(cmd_argv.iter().map(String::as_str));
                let mut opts = ExecOpts::default().with_timeout(Duration::from_secs(10));
                // REDISCLI_AUTH, not `-a`: argv is visible to every local `ps`.
                if let Some(ref p) = pass {
                    opts = opts.with_env("REDISCLI_AUTH", p.as_str());
                }
                let out = exec::run("redis-cli", &argv, opts)?;
                let text = String::from_utf8_lossy(&out.stdout);
                if !out.status.success() || text.starts_with("(error)") {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    return Err(AppError::Shell(format!(
                        "redis: {}",
                        if stderr.trim().is_empty() {
                            text.trim()
                        } else {
                            stderr.trim()
                        }
                    )));
                }
                let columns = vec!["#".into(), "Value".into()];
                let rows = text
                    .lines()
                    .filter(|l| !l.trim().is_empty())
                    .enumerate()
                    .map(|(i, l)| {
                        vec![
                            serde_json::Value::String((i + 1).to_string()),
                            serde_json::Value::String(l.to_string()),
                        ]
                    })
                    .collect();
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
            "Restore",
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
