use super::blocking;
use super::services::{brew_bin, ServicesCache};
use crate::brew::{run_brew, BrewLock};
use crate::context::AppContext;
use crate::core::exec::{self, ExecOpts};
use crate::core::mutation::{mutation, mutation_unattended, BlastRadius, MutationSpec};
use crate::core::validate::{DbName, DbUser, HostName, Port};
use crate::error::{AppError, AppResult};
use crate::services::databases::apfs::{self, DbSnapshot};
use crate::services::databases::classifier;
use crate::services::databases::discovery::{self, DiscoveredDb};
use crate::services::databases::explorer::{
    self, BrowsePage, BrowseRequest, DbPingResult, DbSchema, Endpoint,
};
use crate::services::databases::store::{
    new_connection_id, new_group_id, DbConnection, DbCustomMapping, DbGroup, DbRejectedCandidate,
    QueryResult,
};
use crate::services::databases::DatabaseState;
use std::path::Path;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

fn validate_driver(driver: &str) -> AppResult<()> {
    match driver.to_ascii_lowercase().as_str() {
        "postgres" | "mysql" | "mongo" | "mongodb" | "redis" => Ok(()),
        other => Err(AppError::InvalidName(format!(
            "unsupported database driver: {other}"
        ))),
    }
}

fn validate_env(env: &str) -> AppResult<()> {
    let trimmed = env.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidName("environment cannot be empty".into()));
    }
    match trimmed.to_ascii_lowercase().as_str() {
        "dev" | "development" | "staging" | "prod" | "production" | "local" | "test" => Ok(()),
        other => Err(AppError::InvalidName(format!(
            "unrecognized environment: {other}"
        ))),
    }
}

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
    pub group_id: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateConnectionInput {
    pub id: String,
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
    pub group_id: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateGroupInput {
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateGroupInput {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
}

#[tauri::command]
pub async fn db_list_groups(app: AppHandle) -> AppResult<Vec<DbGroup>> {
    blocking(move || {
        let state = app.state::<DatabaseState>();
        let store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("db store poisoned".into()))?;
        Ok(store.groups.clone())
    })
    .await
}

#[tauri::command]
pub async fn db_create_group(app: AppHandle, input: CreateGroupInput) -> AppResult<DbGroup> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::InvalidName("Group name cannot be empty".into()));
    }
    if name.len() > 100 {
        return Err(AppError::InvalidName("Group name too long".into()));
    }

    let _guard = mutation_unattended(
        MutationSpec::new(
            "Create DB Group",
            format!("Create database group {name}"),
            "create_group",
        )
        .blast_radius(BlastRadius::LocalIsolated)
        .target(&name),
    );

    blocking(move || {
        let state = app.state::<DatabaseState>();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let group = DbGroup {
            id: new_group_id(),
            name,
            description: input
                .description
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty()),
            color: input
                .color
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty()),
            created_at: now,
            updated_at: now,
        };

        let mut store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("db store poisoned".into()))?;
        store.add_group(group.clone());
        let dir = state.path.parent().unwrap_or(&state.path);
        store.save(dir)?;
        Ok(group)
    })
    .await
}

#[tauri::command]
pub async fn db_update_group(app: AppHandle, input: UpdateGroupInput) -> AppResult<DbGroup> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::InvalidName("Group name cannot be empty".into()));
    }
    if name.len() > 100 {
        return Err(AppError::InvalidName("Group name too long".into()));
    }

    let _guard = mutation_unattended(
        MutationSpec::new(
            "Update DB Group",
            format!("Update database group {name}"),
            "update_group",
        )
        .blast_radius(BlastRadius::LocalIsolated)
        .target(&name),
    );

    blocking(move || {
        let state = app.state::<DatabaseState>();
        let mut store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("db store poisoned".into()))?;
        let updated = store
            .update_group(
                &input.id,
                name,
                input
                    .description
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty()),
                input
                    .color
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty()),
            )
            .ok_or_else(|| AppError::NotFound(format!("group {}", input.id)))?;
        let dir = state.path.parent().unwrap_or(&state.path);
        store.save(dir)?;
        Ok(updated)
    })
    .await
}

#[tauri::command]
pub async fn db_delete_group(
    app: AppHandle,
    id: String,
    delete_connections: bool,
) -> AppResult<()> {
    blocking(move || {
        let state = app.state::<DatabaseState>();
        let group_name = {
            let store = state
                .store
                .lock()
                .map_err(|_| AppError::Io("db store poisoned".into()))?;
            store
                .get_group(&id)
                .map(|g| g.name.clone())
                .ok_or_else(|| AppError::NotFound(format!("group {id}")))?
        };

        let guard = if delete_connections {
            mutation(
                &app,
                MutationSpec::new(
                    format!("Delete “{group_name}” and connections?"),
                    "Stackroost removes this group and all its member database connections and deletes their saved Keychain passwords.",
                    "Delete Group and Connections",
                )
                .blast_radius(BlastRadius::LocalIsolated)
                .target(&group_name)
                .destructive(true),
            )?
        } else {
            mutation_unattended(
                MutationSpec::new(
                    "Delete DB Group",
                    format!("Delete group {group_name} (moving connections to Ungrouped)"),
                    "delete_group",
                )
                .blast_radius(BlastRadius::LocalIsolated)
                .target(&group_name),
            )
        };

        let mut store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("db store poisoned".into()))?;
        let (removed_group, affected_ids) = store.remove_group(&id, delete_connections);
        if removed_group.is_none() {
            return Err(AppError::NotFound(format!("group {id}")));
        }
        let dir = state.path.parent().unwrap_or(&state.path);
        store.save(dir)?;
        drop(store);

        if delete_connections {
            for conn_id in affected_ids {
                if let Err(e) =
                    crate::core::keychain::delete_password(&format!("db_conn_{conn_id}"))
                {
                    guard.failure(format!("Keychain entry not deleted for {conn_id}: {e}"));
                }
            }
        }

        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn db_move_connection(
    app: AppHandle,
    id: String,
    group_id: Option<String>,
) -> AppResult<DbConnection> {
    let _guard = mutation_unattended(
        MutationSpec::new(
            "Move DB Connection",
            format!("Move connection {id} to group {group_id:?}"),
            "move_connection",
        )
        .blast_radius(BlastRadius::LocalIsolated)
        .target(&id),
    );

    blocking(move || {
        let state = app.state::<DatabaseState>();
        let mut store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("db store poisoned".into()))?;
        if let Some(ref gid) = group_id {
            if store.get_group(gid).is_none() {
                return Err(AppError::NotFound(format!("group {gid}")));
            }
        }
        let moved = store
            .move_connection(&id, group_id)
            .ok_or_else(|| AppError::NotFound(format!("connection {id}")))?;
        let dir = state.path.parent().unwrap_or(&state.path);
        store.save(dir)?;
        Ok(moved)
    })
    .await
}

#[tauri::command]
pub async fn db_list_custom_mappings(
    app: AppHandle,
    group_id: Option<String>,
) -> AppResult<Vec<DbCustomMapping>> {
    blocking(move || {
        let state = app.state::<DatabaseState>();
        let store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("db store poisoned".into()))?;
        Ok(store.list_custom_mappings(group_id.as_deref()))
    })
    .await
}

#[tauri::command]
pub async fn db_save_custom_mapping(
    app: AppHandle,
    mut mapping: DbCustomMapping,
) -> AppResult<DbCustomMapping> {
    let desc = format!(
        "Save mapping: {}.{} -> {}.{}",
        mapping.source_table, mapping.source_column, mapping.target_table, mapping.target_column
    );
    let _guard = mutation_unattended(
        MutationSpec::new("Save DB Custom Mapping", desc, "save_custom_mapping")
            .blast_radius(BlastRadius::LocalIsolated)
            .target(&mapping.source_table),
    );

    blocking(move || {
        let state = app.state::<DatabaseState>();
        let mut store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("db store poisoned".into()))?;

        let src_conn = store.get(&mapping.source_connection_id).ok_or_else(|| {
            AppError::NotFound(format!(
                "source connection {}",
                mapping.source_connection_id
            ))
        })?;
        let tgt_conn = store.get(&mapping.target_connection_id).ok_or_else(|| {
            AppError::NotFound(format!(
                "target connection {}",
                mapping.target_connection_id
            ))
        })?;

        if src_conn.group_id.as_deref() != Some(&mapping.group_id)
            || tgt_conn.group_id.as_deref() != Some(&mapping.group_id)
        {
            return Err(AppError::InvalidName(
                "Source and target connections must belong to the mapping group".into(),
            ));
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if mapping.id.trim().is_empty() {
            mapping.id = crate::services::databases::store::new_mapping_id();
            mapping.created_at = now;
        }
        mapping.updated_at = now;

        store.add_custom_mapping(mapping.clone());
        let dir = state.path.parent().unwrap_or(&state.path);
        store.save(dir)?;
        Ok(mapping)
    })
    .await
}

#[tauri::command]
pub async fn db_delete_custom_mapping(app: AppHandle, id: String) -> AppResult<()> {
    let _guard = mutation_unattended(
        MutationSpec::new(
            "Delete DB Custom Mapping",
            format!("Delete mapping {id}"),
            "delete_custom_mapping",
        )
        .blast_radius(BlastRadius::LocalIsolated)
        .target(&id),
    );

    blocking(move || {
        let state = app.state::<DatabaseState>();
        let mut store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("db store poisoned".into()))?;
        if store.remove_custom_mapping(&id).is_none() {
            return Err(AppError::NotFound(format!("mapping {id}")));
        }
        let dir = state.path.parent().unwrap_or(&state.path);
        store.save(dir)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn db_list_rejected_candidates(
    app: AppHandle,
    group_id: Option<String>,
) -> AppResult<Vec<DbRejectedCandidate>> {
    blocking(move || {
        let state = app.state::<DatabaseState>();
        let store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("db store poisoned".into()))?;
        Ok(store.list_rejected_candidates(group_id.as_deref()))
    })
    .await
}

#[tauri::command]
pub async fn db_reject_candidate(
    app: AppHandle,
    mut rejected: DbRejectedCandidate,
) -> AppResult<DbRejectedCandidate> {
    let _guard = mutation_unattended(
        MutationSpec::new(
            "Reject Candidate Relation",
            format!(
                "Reject candidate {} -> {}",
                rejected.source_table, rejected.target_table
            ),
            "reject_candidate",
        )
        .blast_radius(BlastRadius::LocalIsolated)
        .target(&rejected.source_table),
    );

    blocking(move || {
        let state = app.state::<DatabaseState>();
        let mut store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("db store poisoned".into()))?;

        if rejected.id.trim().is_empty() {
            rejected.id = format!(
                "rej_{}_{}_{}_{}_{}_{}",
                rejected.source_connection_id,
                rejected.source_table,
                rejected.source_column,
                rejected.target_connection_id,
                rejected.target_table,
                rejected.target_column
            );
        }
        if rejected.created_at == 0 {
            rejected.created_at = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
        }

        store.add_rejected_candidate(rejected.clone());
        let dir = state.path.parent().unwrap_or(&state.path);
        store.save(dir)?;
        Ok(rejected)
    })
    .await
}

#[tauri::command]
pub async fn db_unreject_candidate(app: AppHandle, id: String) -> AppResult<()> {
    let _guard = mutation_unattended(
        MutationSpec::new(
            "Unreject Candidate Relation",
            format!("Unreject candidate {id}"),
            "unreject_candidate",
        )
        .blast_radius(BlastRadius::LocalIsolated)
        .target(&id),
    );

    blocking(move || {
        let state = app.state::<DatabaseState>();
        let mut store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("db store poisoned".into()))?;
        if store.remove_rejected_candidate(&id).is_none() {
            return Err(AppError::NotFound(format!("rejected candidate {id}")));
        }
        let dir = state.path.parent().unwrap_or(&state.path);
        store.save(dir)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn db_update_connection(
    app: AppHandle,
    input: UpdateConnectionInput,
) -> AppResult<DbConnection> {
    validate_driver(&input.driver)?;
    validate_env(&input.env)?;
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
            "Update DB Connection",
            format!(
                "Update connection {} ({}:{})",
                input.name, input.host, input.port
            ),
            "update_connection",
        )
        .blast_radius(BlastRadius::LocalIsolated)
        .target(&input.name),
    );

    let is_prod = input.env == "prod" || input.env == "production";
    let allow_writes = input.allow_writes && !is_prod;
    let password_opt = input.password.clone();

    blocking(move || {
        let state = app.state::<DatabaseState>();
        let mut store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("db store poisoned".into()))?;

        // Verify connection exists
        let _ = store
            .get(&input.id)
            .ok_or_else(|| AppError::NotFound(format!("connection {}", input.id)))?;

        // If target group is specified, verify it exists
        if let Some(ref gid) = input.group_id {
            if store.get_group(gid).is_none() {
                return Err(AppError::NotFound(format!("group {gid}")));
            }
        }

        // If password is provided, update Keychain first
        if let Some(ref pass) = password_opt {
            crate::core::keychain::set_password(&format!("db_conn_{}", input.id), pass)
                .map_err(|e| AppError::Io(format!("Failed to update Keychain password: {e}")))?;
        }

        let conn = DbConnection {
            id: input.id,
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
            group_id: input.group_id,
        };

        store
            .update_connection(conn.clone())
            .ok_or_else(|| AppError::NotFound(format!("connection {}", conn.id)))?;
        let dir = state.path.parent().unwrap_or(&state.path);
        store.save(dir)?;
        Ok(conn)
    })
    .await
}

#[tauri::command]
pub async fn db_add_connection(
    app: AppHandle,
    input: AddConnectionInput,
) -> AppResult<DbConnection> {
    // Validate inputs
    validate_driver(&input.driver)?;
    validate_env(&input.env)?;
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
            crate::core::keychain::set_password(&format!("db_conn_{conn_id}"), pass)
                .map_err(|e| AppError::Io(format!("Failed to save Keychain password: {e}")))?;
        }

        let mut store = state
            .store
            .lock()
            .map_err(|_| AppError::Io("db store poisoned".into()))?;

        if let Some(ref gid) = input.group_id {
            if store.get_group(gid).is_none() {
                return Err(AppError::NotFound(format!("group {gid}")));
            }
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
            group_id: input.group_id,
        };
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
/// Bounded to max 3 concurrent introspections via schema_semaphore.
#[tauri::command]
pub async fn db_schema(app: AppHandle, id: String) -> AppResult<DbSchema> {
    let state = app.state::<DatabaseState>();
    let permit = state
        .schema_semaphore
        .clone()
        .acquire_owned()
        .await
        .map_err(|e| AppError::Io(format!("schema semaphore closed: {e}")))?;

    blocking(move || {
        let _permit = permit;
        explorer::schema(&endpoint_of(&app, &id)?)
    })
    .await
}

/// Lightweight connection health check (SELECT 1 / PING / ping command).
#[tauri::command]
pub async fn db_ping(app: AppHandle, id: String) -> AppResult<DbPingResult> {
    blocking(move || {
        let ep = endpoint_of(&app, &id)?;
        let start = std::time::Instant::now();
        match explorer::ping(&ep) {
            Ok(_) => Ok(DbPingResult {
                ok: true,
                latency_ms: start.elapsed().as_millis() as u64,
                error: None,
            }),
            Err(e) => Ok(DbPingResult {
                ok: false,
                latency_ms: start.elapsed().as_millis() as u64,
                error: Some(e.to_string()),
            }),
        }
    })
    .await
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
                // No `-u`/`-p` on argv — mongosh has no `*_PASSWORD` env var
                // of its own, so credentials travel as env vars under names
                // we chose and are read back inside the `--eval`'d script;
                // `ps` can read another process's argv without privilege but
                // not its environment (AUDIT-2026-10-24 SEC-01), matching the
                // PGPASSWORD/MYSQL_PWD/REDISCLI_AUTH handling above.
                let db_literal = serde_json::to_string(conn.database.as_deref().unwrap_or("test"))
                    .unwrap_or_else(|_| "\"test\"".into());
                let mut opts = ExecOpts::default().with_timeout(Duration::from_secs(10));
                let prelude = if let Some(ref u) = conn.user {
                    opts = opts.with_env("STACKROOST_MONGO_USER", u);
                    if let Some(ref p) = pass {
                        opts = opts.with_env("STACKROOST_MONGO_PASS", p);
                    }
                    let base_literal = serde_json::to_string(&format!(
                        "mongodb://{}:{}/?authSource=admin",
                        valid_host.as_str(),
                        valid_port.as_u16()
                    ))
                    .unwrap_or_else(|_| "\"\"".into());
                    format!(
                        "const __base = {base_literal};\n\
                         const __u = process.env.STACKROOST_MONGO_USER;\n\
                         const __p = process.env.STACKROOST_MONGO_PASS;\n\
                         const __auth = __p ? encodeURIComponent(__u) + ':' + encodeURIComponent(__p) + '@' \
                                             : encodeURIComponent(__u) + '@';\n\
                         const db = Mongo(__base.replace('mongodb://', 'mongodb://' + __auth)).getDB({db_literal});\n"
                    )
                } else {
                    let base_literal = serde_json::to_string(&format!(
                        "mongodb://{}:{}/",
                        valid_host.as_str(),
                        valid_port.as_u16()
                    ))
                    .unwrap_or_else(|_| "\"\"".into());
                    format!("const db = Mongo({base_literal}).getDB({db_literal});\n")
                };

                let full_script = format!("{prelude}{sanitized}");
                let argv = ["--norc", "--quiet", "--eval", full_script.as_str()];
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

/// Stop `svc` through the same `BrewLock` + cache-invalidate path the
/// Services tab uses, and confirm it is actually stopped before returning —
/// `brew services stop` can report success while the process is still
/// shutting down. Returns an error instead of letting the caller clone a
/// data directory a server might still be writing to (AUDIT-2026-10-24 BUG-01).
fn stop_service_checked(app: &AppHandle, ctx: &State<'_, AppContext>, svc: &str) -> AppResult<()> {
    apfs::check_service_name(svc)?;
    let bin = brew_bin(ctx)?.to_string();
    let lock = app.state::<BrewLock>();
    let _g = lock
        .0
        .lock()
        .map_err(|_| AppError::Io("brew lock poisoned".into()))?;
    run_brew(&bin, &["services", "stop", svc])?;
    app.state::<ServicesCache>().invalidate();

    let deadline = std::time::Instant::now() + Duration::from_secs(10);
    loop {
        let status = run_brew(&bin, &["services", "info", svc, "--json"]).ok();
        let still_running = status
            .as_deref()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
            .and_then(|v| v.as_array().and_then(|a| a.first().cloned()))
            .and_then(|e| e.get("running").and_then(|r| r.as_bool()))
            .unwrap_or(false);
        if !still_running {
            return Ok(());
        }
        if std::time::Instant::now() >= deadline {
            return Err(AppError::Shell(format!(
                "{svc} is still reported running after `brew services stop` \
                 — refusing to touch its data directory"
            )));
        }
        std::thread::sleep(Duration::from_millis(300));
    }
}

/// Start `svc` back up the same way the Services tab does.
fn start_service_checked(app: &AppHandle, ctx: &State<'_, AppContext>, svc: &str) -> AppResult<()> {
    let bin = brew_bin(ctx)?.to_string();
    let lock = app.state::<BrewLock>();
    let _g = lock
        .0
        .lock()
        .map_err(|_| AppError::Io("brew lock poisoned".into()))?;
    run_brew(&bin, &["services", "start", svc])?;
    app.state::<ServicesCache>().invalidate();
    Ok(())
}

#[tauri::command]
pub async fn db_create_snapshot(
    app: AppHandle,
    ctx: State<'_, AppContext>,
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

    if let Some(svc) = service_name.as_deref() {
        stop_service_checked(&app, &ctx, svc)?;
    }
    let clone_result = blocking({
        let (data_dir, label, service_name) =
            (data_dir.clone(), label.clone(), service_name.clone());
        move || apfs::create_snapshot(service_name.as_deref(), Path::new(&data_dir), &label)
    })
    .await;
    if let Some(svc) = service_name.as_deref() {
        // Always try to restart, even if the clone failed, and fold a failed
        // restart into whatever message the caller sees instead of hiding it.
        if let Err(restart_err) = start_service_checked(&app, &ctx, svc) {
            return Err(match clone_result {
                Ok(snap) => AppError::Shell(format!(
                    "snapshot created ({}), but {svc} did not restart: {restart_err}",
                    snap.id
                )),
                Err(clone_err) => AppError::Shell(format!(
                    "{clone_err}; also, {svc} did not restart: {restart_err}"
                )),
            });
        }
    }
    clone_result
}

#[tauri::command]
pub async fn db_restore_snapshot(
    app: AppHandle,
    ctx: State<'_, AppContext>,
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

    if let Some(svc) = service_name.as_deref() {
        stop_service_checked(&app, &ctx, svc)?;
    }
    let restore_result = blocking({
        let (data_dir, snapshot_path) = (data_dir.clone(), snapshot_path.clone());
        move || apfs::restore_snapshot(Path::new(&data_dir), Path::new(&snapshot_path))
    })
    .await;
    if let Some(svc) = service_name.as_deref() {
        if let Err(restart_err) = start_service_checked(&app, &ctx, svc) {
            return Err(match restore_result {
                Ok(()) => AppError::Shell(format!(
                    "restore finished, but {svc} did not restart: {restart_err}"
                )),
                Err(restore_err) => AppError::Shell(format!(
                    "{restore_err}; also, {svc} did not restart: {restart_err}"
                )),
            });
        }
    }
    restore_result
}
