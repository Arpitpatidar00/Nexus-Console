// Remote (Servers) commands — thin wrappers over `crate::remote`. The frontend
// only ever sends a host `id` (plus display fields); hostnames, users and
// aliases are resolved and validated here (docs/remote/PLAN.md §4.10).

use super::{blocking, confirm_action};
use crate::error::{AppError, AppResult};
use crate::remote::cleanup::{self, PruneResult, ServerDiskReport};
use crate::remote::docker::{self, ComposeAction, DockerAction};
use crate::remote::files::{self, RemoteFileContent, RemoteFileEntry};
use crate::remote::history::{Incident, SnapshotDiff, SnapshotSummary};
use crate::remote::inspection::{self, InspectionData};
use crate::remote::notes::HostNote;
use crate::remote::probe::{self, HostSnapshot};
use crate::remote::runbooks::{new_runbook_id, RunbookItem};
use crate::remote::store::JournalEntry;
use crate::remote::store::{
    new_host_id, new_tunnel_id, Consent, Env, Host, HostSource, ManualTarget, TunnelConfig,
    DEFAULT_PROJECT,
};
use crate::remote::tunnel::TunnelStatus;
use crate::remote::{config, ssh, with_host_lock, RemoteState};
use crate::util::validate::{
    validate_display_text, validate_hostname, validate_identity_file, validate_port,
    validate_ssh_user,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteStateDto {
    consent: Consent,
    hosts: Vec<Host>,
    tunnels: Vec<TunnelConfig>,
}

#[tauri::command]
pub async fn remote_state(app: AppHandle) -> AppResult<RemoteStateDto> {
    blocking(move || {
        let s = app.state::<RemoteState>();
        let s = s.read()?;
        Ok(RemoteStateDto {
            consent: s.consent.clone(),
            hosts: s.hosts.clone(),
            tunnels: s.tunnels.clone(),
        })
    })
    .await
}

/// Revoking also closes every open connection; imported hosts are kept.
#[tauri::command]
pub async fn remote_set_consent(app: AppHandle, granted: bool) -> AppResult<()> {
    // Mirror into the unified consent store so Settings -> Privacy shows it too.
    crate::core::consent::set_consent(crate::core::DataSource::SshConfig, granted)?;
    blocking(move || {
        let state = app.state::<RemoteState>();
        if !granted {
            state.disconnect_all();
        }
        state.write(|s| {
            s.consent = Consent {
                granted,
                granted_at_epoch: granted.then(crate::doctor::claude::now_epoch),
            };
            Ok(())
        })
    })
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedHost {
    alias: String,
    hostname: String,
    user: String,
    port: u32,
    proxy_jump: Option<String>,
    imported: bool,
}

/// Concrete aliases from ssh_config, each resolved through `ssh -G`.
/// An alias ssh can't resolve is left out rather than failing the scan.
#[tauri::command]
pub async fn remote_scan_config(app: AppHandle) -> AppResult<Vec<ScannedHost>> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        state.read()?.require_consent()?;
        let (cfg, ssh_dir) = config::user_config()?;
        let aliases = config::list_config_aliases(&cfg, &ssh_dir);
        let resolved: Vec<_> = std::thread::scope(|s| {
            let hs: Vec<_> = aliases
                .iter()
                .map(|a| s.spawn(move || (a.clone(), config::resolve(a))))
                .collect();
            hs.into_iter().filter_map(|h| h.join().ok()).collect()
        });
        let store = state.read()?;
        Ok(resolved
            .into_iter()
            .filter_map(|(alias, r)| {
                let r = r.ok()?;
                Some(ScannedHost {
                    imported: store.has_alias(&alias),
                    alias,
                    hostname: r.hostname,
                    user: r.user,
                    port: r.port,
                    proxy_jump: r.proxy_jump,
                })
            })
            .collect())
    })
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportHost {
    alias: String,
    label: Option<String>,
    project: Option<String>,
    env: Env,
}

fn display_or(what: &str, v: Option<&str>, fallback: &str) -> AppResult<String> {
    match v {
        Some(v) if !v.trim().is_empty() => validate_display_text(what, v),
        _ => Ok(fallback.to_string()),
    }
}

/// Import aliases chosen in the scan. Each must still exist in a fresh scan;
/// already-imported aliases are skipped.
#[tauri::command]
pub async fn remote_import_hosts(app: AppHandle, hosts: Vec<ImportHost>) -> AppResult<()> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        state.read()?.require_consent()?;
        let (cfg, ssh_dir) = config::user_config()?;
        let known = config::list_config_aliases(&cfg, &ssh_dir);
        state.write(|s| {
            for h in hosts {
                if !known.contains(&h.alias) {
                    return Err(AppError::NotFound(format!(
                        "{} is no longer in your SSH config",
                        h.alias
                    )));
                }
                if s.has_alias(&h.alias) {
                    continue;
                }
                let host = Host {
                    id: new_host_id(),
                    source: HostSource::SshConfig,
                    label: display_or("label", h.label.as_deref(), &h.alias)?,
                    project: display_or("project", h.project.as_deref(), DEFAULT_PROJECT)?,
                    alias: Some(h.alias),
                    manual: None,
                    env: h.env,
                    order: s.next_order(),
                    auto_connect: false,
                };
                s.hosts.push(host);
            }
            Ok(())
        })
    })
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualHostInput {
    hostname: String,
    user: String,
    port: u32,
    identity_file: Option<String>,
    label: Option<String>,
    project: Option<String>,
    env: Env,
}

/// A host outside ssh_config. Needs no consent: nothing is read to add it.
#[tauri::command]
pub async fn remote_add_manual_host(app: AppHandle, input: ManualHostInput) -> AppResult<Host> {
    blocking(move || {
        validate_hostname(&input.hostname)?;
        validate_ssh_user(&input.user)?;
        validate_port(input.port)?;
        let identity_file = input.identity_file.filter(|p| !p.trim().is_empty());
        if let Some(p) = &identity_file {
            validate_identity_file(p)?;
        }
        let fallback = format!("{}@{}", input.user, input.hostname);
        let label = display_or("label", input.label.as_deref(), &fallback)?;
        let project = display_or("project", input.project.as_deref(), DEFAULT_PROJECT)?;
        app.state::<RemoteState>().write(|s| {
            let host = Host {
                id: new_host_id(),
                source: HostSource::Manual,
                alias: None,
                manual: Some(ManualTarget {
                    hostname: input.hostname,
                    user: input.user,
                    port: input.port,
                    identity_file,
                }),
                label,
                project,
                env: input.env,
                order: s.next_order(),
                auto_connect: false,
            };
            s.hosts.push(host.clone());
            Ok(host)
        })
    })
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostPatch {
    label: Option<String>,
    project: Option<String>,
    env: Option<Env>,
    order: Option<u32>,
    auto_connect: Option<bool>,
}

#[tauri::command]
pub async fn remote_update_host(app: AppHandle, id: String, patch: HostPatch) -> AppResult<()> {
    blocking(move || {
        let label = patch
            .label
            .map(|v| validate_display_text("label", &v))
            .transpose()?;
        let project = patch
            .project
            .map(|v| validate_display_text("project", &v))
            .transpose()?;
        app.state::<RemoteState>().write(|s| {
            let h = s.host_mut(&id)?;
            if let Some(v) = label {
                h.label = v;
            }
            if let Some(v) = project {
                h.project = v;
            }
            if let Some(v) = patch.env {
                h.env = v;
            }
            if let Some(v) = patch.order {
                h.order = v;
            }
            if let Some(v) = patch.auto_connect {
                h.auto_connect = v;
            }
            Ok(())
        })
    })
    .await
}

/// Forget a host (the server itself is untouched). Native confirm, then its
/// master connection is closed.
#[tauri::command]
pub async fn remote_remove_host(app: AppHandle, id: String) -> AppResult<()> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let host = state.read()?.host(&id)?.clone();
        confirm_action(
            &app,
            &format!("Remove “{}” from Servers?", host.label),
            "Nexus forgets this server and closes its connection. Nothing on the server \
             changes, and your SSH config is left as it is.",
            "Remove",
            false,
        )?;
        if let Ok(t) = ssh::SshTarget::from_host(&host) {
            ssh::control_exit(&t);
        }
        state.forget_snapshot(&id);
        state.write(|s| {
            s.hosts.retain(|h| h.id != id);
            Ok(())
        })
    })
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionDto {
    connected: bool,
    latency_ms: u64,
}

/// Open (or reuse) the host's master connection with a no-op `true` exec.
/// Only ever user-initiated: the app never auto-connects.
#[tauri::command]
pub async fn remote_connect(app: AppHandle, id: String) -> AppResult<ConnectionDto> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let target = state.target(&id)?;
        with_host_lock(&state, &id, || {
            let out = ssh::exec(&target, &["true"], None, ssh::DEFAULT_TIMEOUT)?;
            Ok(ConnectionDto {
                connected: out.status.success(),
                latency_ms: out.elapsed.as_millis() as u64,
            })
        })
    })
    .await
}

#[tauri::command]
pub async fn remote_disconnect(app: AppHandle, id: String) -> AppResult<()> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let host = state.read()?.host(&id)?.clone();
        ssh::control_exit(&ssh::SshTarget::from_host(&host)?);
        Ok(())
    })
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostStatus {
    id: String,
    connected: bool,
}

/// `ssh -O check` per host, in parallel. Local socket only: no network.
#[tauri::command]
pub async fn remote_status(app: AppHandle) -> AppResult<Vec<HostStatus>> {
    blocking(move || {
        let hosts = app.state::<RemoteState>().read()?.hosts.clone();
        Ok(std::thread::scope(|s| {
            let hs: Vec<_> = hosts
                .iter()
                .map(|h| {
                    s.spawn(move || HostStatus {
                        id: h.id.clone(),
                        connected: ssh::SshTarget::from_host(h)
                            .map(|t| ssh::control_check(&t))
                            .unwrap_or(false),
                    })
                })
                .collect();
            hs.into_iter().filter_map(|h| h.join().ok()).collect()
        }))
    })
    .await
}

/// Run the read-only probe: one ssh round trip. A second request while one is
/// in flight for the same host gets `Busy` (the poll simply skips a beat).
#[tauri::command]
pub async fn remote_snapshot(app: AppHandle, id: String) -> AppResult<HostSnapshot> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let target = state.target(&id)?;
        let snap = with_host_lock(&state, &id, || probe::run(&target))?;
        state.remember_snapshot(&id, &snap);
        Ok(snap)
    })
    .await
}

/// start / stop / restart / remove a container the latest snapshot reported.
/// Native confirm (host label + ENV, destructive on prod), then the fixed
/// argv, then a journal entry whatever the outcome.
#[tauri::command]
pub async fn remote_docker_action(
    app: AppHandle,
    id: String,
    container: String,
    action: DockerAction,
) -> AppResult<()> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let p = docker::prepare(&state, &id, &container, action)?;
        confirm_action(
            &app,
            &p.confirm_title(),
            &p.confirm_message(),
            p.action.label(),
            p.destructive(),
        )?;
        docker::execute(&state, &p)
    })
    .await
}

#[tauri::command]
pub async fn remote_journal(app: AppHandle) -> AppResult<Vec<JournalEntry>> {
    blocking(move || Ok(app.state::<RemoteState>().read()?.journal.clone())).await
}

#[tauri::command]
pub async fn remote_get_tunnels(app: AppHandle) -> AppResult<Vec<TunnelStatus>> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        state.tunnels.statuses(&state)
    })
    .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddTunnelInput {
    pub host_id: String,
    pub name: String,
    pub local_port: u16,
    pub remote_host: Option<String>,
    pub remote_port: u16,
    pub auto_start: Option<bool>,
}

#[tauri::command]
pub async fn remote_add_tunnel(app: AppHandle, input: AddTunnelInput) -> AppResult<TunnelConfig> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        validate_display_text(&input.name, "tunnel name")?;
        validate_port(input.local_port as u32)?;
        validate_port(input.remote_port as u32)?;
        let remote_host = input.remote_host.unwrap_or_else(|| "127.0.0.1".to_string());
        validate_hostname(&remote_host)?;

        let config = TunnelConfig {
            id: new_tunnel_id(),
            host_id: input.host_id,
            name: input.name,
            local_port: input.local_port,
            remote_host,
            remote_port: input.remote_port,
            auto_start: input.auto_start.unwrap_or(false),
        };

        state.write(|s| {
            s.host(&config.host_id)?;
            s.tunnels.push(config.clone());
            Ok(())
        })?;

        if config.auto_start {
            let _ = state.tunnels.open(&state, &config.id);
        }

        Ok(config)
    })
    .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTunnelPatch {
    pub name: Option<String>,
    pub local_port: Option<u16>,
    pub remote_host: Option<String>,
    pub remote_port: Option<u16>,
    pub auto_start: Option<bool>,
}

#[tauri::command]
pub async fn remote_update_tunnel(
    app: AppHandle,
    id: String,
    patch: UpdateTunnelPatch,
) -> AppResult<TunnelConfig> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        if let Some(ref name) = patch.name {
            validate_display_text(name, "tunnel name")?;
        }
        if let Some(port) = patch.local_port {
            validate_port(port as u32)?;
        }
        if let Some(port) = patch.remote_port {
            validate_port(port as u32)?;
        }
        if let Some(ref host) = patch.remote_host {
            validate_hostname(host)?;
        }

        state.write(|s| {
            let t = s.tunnel_mut(&id)?;
            if let Some(n) = patch.name {
                t.name = n;
            }
            if let Some(p) = patch.local_port {
                t.local_port = p;
            }
            if let Some(h) = patch.remote_host {
                t.remote_host = h;
            }
            if let Some(p) = patch.remote_port {
                t.remote_port = p;
            }
            if let Some(a) = patch.auto_start {
                t.auto_start = a;
            }
            Ok(t.clone())
        })
    })
    .await
}

#[tauri::command]
pub async fn remote_remove_tunnel(app: AppHandle, id: String) -> AppResult<()> {
    confirm_action(
        &app,
        "Remove SSH tunnel?",
        "This will close the local forward port and remove the tunnel configuration.",
        "Remove Tunnel",
        false,
    )?;
    blocking(move || {
        let state = app.state::<RemoteState>();
        let _ = state.tunnels.close(&state, &id);
        state.write(|s| {
            s.remove_tunnel(&id)
                .ok_or_else(|| AppError::NotFound(format!("unknown tunnel {id}")))?;
            Ok(())
        })
    })
    .await
}

#[tauri::command]
pub async fn remote_open_tunnel(app: AppHandle, id: String) -> AppResult<TunnelStatus> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let (tunnel, host) = {
            let s = state.read()?;
            let t = s.tunnel(&id)?.clone();
            let h = s.host(&t.host_id)?.clone();
            (t, h)
        };

        if host.env == Env::Prod {
            confirm_action(
                &app,
                &format!("Open tunnel “{}” to PROD?", tunnel.name),
                &format!(
                    "This forwards local port {} to {}:{} on {}. Requests sent locally will directly hit your production environment.",
                    tunnel.local_port, tunnel.remote_host, tunnel.remote_port, host.label
                ),
                "Open Tunnel",
                true,
            )?;
        }

        state.tunnels.open(&state, &id)
    })
    .await
}

#[tauri::command]
pub async fn remote_close_tunnel(app: AppHandle, id: String) -> AppResult<()> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        state.tunnels.close(&state, &id)
    })
    .await
}

#[tauri::command]
pub async fn remote_compose_action(
    app: AppHandle,
    id: String,
    project: String,
    action: ComposeAction,
) -> AppResult<()> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let p = docker::prepare_compose(&state, &id, &project, action)?;
        confirm_action(
            &app,
            &p.confirm_title(),
            &p.confirm_message(),
            p.action.label(),
            p.destructive(),
        )?;
        docker::execute_compose(&state, &p)
    })
    .await
}

#[tauri::command]
pub async fn remote_inspect_services(app: AppHandle, id: String) -> AppResult<InspectionData> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let target = state.target(&id)?;
        inspection::inspect_host(&target)
    })
    .await
}

#[tauri::command]
pub async fn remote_disk_report(app: AppHandle, id: String) -> AppResult<ServerDiskReport> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let target = state.target(&id)?;
        cleanup::get_disk_report(&target)
    })
    .await
}

#[tauri::command]
pub async fn remote_prune_builder(app: AppHandle, id: String) -> AppResult<PruneResult> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let host = state.read()?.host(&id)?.clone();
        confirm_action(
            &app,
            &format!("Prune Docker build cache on {}?", host.label),
            "This removes all unused Docker build cache layers on the server. Active images and containers are left untouched.",
            "Prune Cache",
            host.env == Env::Prod,
        )?;
        cleanup::prune_build_cache(&state, &id)
    })
    .await
}

#[tauri::command]
pub async fn remote_prune_images(app: AppHandle, id: String) -> AppResult<PruneResult> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let host = state.read()?.host(&id)?.clone();
        confirm_action(
            &app,
            &format!("Prune dangling images on {}?", host.label),
            "This deletes untagged (dangling) Docker images on the server to reclaim disk space. Tagged images are untouched.",
            "Prune Images",
            host.env == Env::Prod,
        )?;
        cleanup::prune_dangling_images(&state, &id)
    })
    .await
}

#[tauri::command]
pub async fn remote_list_files(
    app: AppHandle,
    id: String,
    path: String,
) -> AppResult<Vec<RemoteFileEntry>> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let target = state.target(&id)?;
        files::list_directory(&target, &path)
    })
    .await
}

#[tauri::command]
pub async fn remote_read_file(
    app: AppHandle,
    id: String,
    path: String,
    reveal: bool,
) -> AppResult<RemoteFileContent> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let target = state.target(&id)?;
        files::read_file(&target, &path, reveal)
    })
    .await
}

#[tauri::command]
pub async fn remote_download_file(
    app: AppHandle,
    id: String,
    remote_path: String,
    local_destination: String,
) -> AppResult<()> {
    let _guard = crate::core::mutation::mutation_unattended(
        crate::core::mutation::MutationSpec::new(
            "Download Remote File",
            format!("Download {remote_path} to {local_destination}"),
            "remote_download_file",
        )
        .blast_radius(crate::core::mutation::BlastRadius::LocalIsolated)
        .target(&id),
    );
    blocking(move || {
        let state = app.state::<RemoteState>();
        let target = state.target(&id)?;
        let host = {
            let s = state.read()?;
            s.host(&id)?.clone()
        };
        let local_path = std::path::Path::new(&local_destination);
        let res = files::download_file(&target, &remote_path, local_path);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let (result, msg) = match &res {
            Ok(()) => ("ok", String::new()),
            Err(e) => ("error", e.to_string()),
        };

        let _ = state.write(|s| {
            s.append_journal(JournalEntry {
                at_epoch: now,
                host_id: host.id.clone(),
                host_label: host.label.clone(),
                env: host.env,
                action: "file.download".to_string(),
                target: remote_path.clone(),
                result: result.into(),
                message: msg,
            });
            Ok(())
        });

        res
    })
    .await
}

#[tauri::command]
pub async fn remote_upload_file(
    app: AppHandle,
    id: String,
    local_source: String,
    remote_path: String,
    overwrite: bool,
    confirm_token: Option<String>,
) -> AppResult<()> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let (host, target) = {
            let s = state.read()?;
            let h = s.host(&id)?.clone();
            let t = state.target(&id)?;
            (h, t)
        };

        let is_prod = host.env == crate::remote::store::Env::Prod;
        if is_prod && confirm_token.as_deref() != Some("UPLOAD") {
            return Err(AppError::Forbidden(
                "Production upload requires explicit confirmation token 'UPLOAD'".into(),
            ));
        }

        let radius = if is_prod {
            crate::core::mutation::BlastRadius::RemoteProd
        } else {
            crate::core::mutation::BlastRadius::RemoteNonProd
        };

        let _guard = crate::core::mutation::mutation(
            &app,
            crate::core::mutation::MutationSpec::new(
                "Upload Remote File",
                format!("Upload {local_source} to {remote_path} on {}", host.label),
                "remote_upload_file",
            )
            .blast_radius(radius)
            .prod(is_prod)
            .target(&id),
        )?;

        let local_path = std::path::Path::new(&local_source);
        let res = files::upload_file(&target, local_path, &remote_path, overwrite);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let (result, msg) = match &res {
            Ok(()) => ("ok", String::new()),
            Err(e) => ("error", e.to_string()),
        };

        let _ = state.write(|s| {
            s.append_journal(JournalEntry {
                at_epoch: now,
                host_id: host.id.clone(),
                host_label: host.label.clone(),
                env: host.env,
                action: "file.upload".to_string(),
                target: remote_path.clone(),
                result: result.into(),
                message: msg,
            });
            Ok(())
        });

        res
    })
    .await
}

#[tauri::command]
pub async fn remote_get_note(app: AppHandle, id: String) -> AppResult<HostNote> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let n = state
            .notes
            .lock()
            .map_err(|_| AppError::Io("notes poisoned".into()))?;
        Ok(n.get(&id))
    })
    .await
}

#[tauri::command]
pub async fn remote_save_note(app: AppHandle, id: String, content: String) -> AppResult<HostNote> {
    let _guard = crate::core::mutation::mutation_unattended(
        crate::core::mutation::MutationSpec::new(
            "Save Host Note",
            format!("Update note for host {id}"),
            "remote_save_note",
        )
        .blast_radius(crate::core::mutation::BlastRadius::LocalIsolated)
        .target(&id),
    );
    blocking(move || {
        let state = app.state::<RemoteState>();
        let mut n = state
            .notes
            .lock()
            .map_err(|_| AppError::Io("notes poisoned".into()))?;
        let note = n.set(&id, content);
        let dir = state.path.parent().unwrap_or(&state.path);
        n.save(dir)?;
        Ok(note)
    })
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostHistoryDto {
    pub summaries: Vec<SnapshotSummary>,
    pub latest_diff: Option<SnapshotDiff>,
    pub incidents: Vec<Incident>,
}

#[tauri::command]
pub async fn remote_get_history(app: AppHandle, id: String) -> AppResult<HostHistoryDto> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let h = state
            .history
            .lock()
            .map_err(|_| AppError::Io("history poisoned".into()))?;
        let summaries = h.summaries.get(&id).cloned().unwrap_or_default();
        let latest_diff = h.latest_diff(&id);
        let incidents = h.incidents_for(&id);
        Ok(HostHistoryDto {
            summaries,
            latest_diff,
            incidents,
        })
    })
    .await
}

#[tauri::command]
pub async fn remote_get_runbooks(
    app: AppHandle,
    host_id: Option<String>,
    project: Option<String>,
) -> AppResult<Vec<RunbookItem>> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let r = state
            .runbooks
            .lock()
            .map_err(|_| AppError::Io("runbooks poisoned".into()))?;
        Ok(r.list(host_id.as_deref(), project.as_deref()))
    })
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddRunbookInput {
    pub host_id: Option<String>,
    pub project: Option<String>,
    pub name: String,
    pub command: String,
    pub description: Option<String>,
}

#[tauri::command]
pub async fn remote_add_runbook(app: AppHandle, input: AddRunbookInput) -> AppResult<RunbookItem> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        validate_display_text(&input.name, "runbook name")?;
        if input.command.trim().is_empty() {
            return Err(AppError::InvalidName("command cannot be empty".into()));
        }

        let item = RunbookItem {
            id: new_runbook_id(),
            host_id: input.host_id,
            project: input.project,
            name: input.name,
            command: input.command,
            description: input.description,
        };

        let mut r = state
            .runbooks
            .lock()
            .map_err(|_| AppError::Io("runbooks poisoned".into()))?;
        r.add(item.clone());
        let dir = state.path.parent().unwrap_or(&state.path);
        r.save(dir)?;
        Ok(item)
    })
    .await
}

#[tauri::command]
pub async fn remote_remove_runbook(app: AppHandle, id: String) -> AppResult<()> {
    confirm_action(
        &app,
        "Remove Runbook?",
        "This will permanently delete the saved runbook.",
        "Remove Runbook",
        true,
    )?;
    blocking(move || {
        let state = app.state::<RemoteState>();
        let mut r = state
            .runbooks
            .lock()
            .map_err(|_| AppError::Io("runbooks poisoned".into()))?;
        r.remove(&id)
            .ok_or_else(|| AppError::NotFound(format!("runbook {id}")))?;
        let dir = state.path.parent().unwrap_or(&state.path);
        r.save(dir)?;
        Ok(())
    })
    .await
}

use crate::remote::deploys::{self, DeployPreview, DeployRecord, DeployResult};
use crate::remote::parity::{self, ParityReport};
use crate::remote::teleport::{self, TeleportResult};
use std::collections::HashMap;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParityAuditInput {
    pub local_project_path: Option<String>,
    pub host_ids: Vec<String>,
    pub remote_app_paths: HashMap<String, String>,
}

#[tauri::command]
pub async fn remote_audit_parity(
    app: AppHandle,
    input: ParityAuditInput,
) -> AppResult<ParityReport> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let store = state.read()?;
        let mut hosts_info = Vec::new();
        let targets = input
            .host_ids
            .iter()
            .map(|id| state.target(id))
            .collect::<AppResult<Vec<_>>>()?;

        for (i, id) in input.host_ids.iter().enumerate() {
            let host = store.host(id)?;
            let env_str = match host.env {
                Env::Prod => "prod",
                Env::Staging => "staging",
                Env::Dev => "dev",
                Env::Other => "other",
            };
            let app_dir = input
                .remote_app_paths
                .get(id)
                .map(|s| s.as_str())
                .unwrap_or("");
            hosts_info.push((id.as_str(), &targets[i], env_str, app_dir));
        }

        parity::run_parity_audit(input.local_project_path.as_deref(), &hosts_info)
    })
    .await
}

#[tauri::command]
pub async fn remote_preview_deploy(
    app: AppHandle,
    id: String,
    project: String,
) -> AppResult<DeployPreview> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let target = state.target(&id)?;
        deploys::preview_deploy(&target, &project)
    })
    .await
}

#[tauri::command]
pub async fn remote_execute_deploy(
    app: AppHandle,
    id: String,
    project: String,
    services: Vec<String>,
) -> AppResult<DeployResult> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let host = state.read()?.host(&id)?.clone();
        if host.env == Env::Prod {
            confirm_action(
                &app,
                &format!("Deploy Compose Stack on {}?", host.label),
                &format!("This will pull updated image tags and restart services for '{project}' on production server {}.", host.label),
                "Deploy to Production",
                true,
            )?;
        }
        let target = state.target(&id)?;
        let res = deploys::execute_deploy(&target, &id, &project, services)?;

        let mut d = state
            .deploys
            .lock()
            .map_err(|_| AppError::Io("deploys poisoned".into()))?;
        d.add(res.record.clone());
        let dir = state.path.parent().unwrap_or(&state.path);
        d.save(dir)?;

        Ok(res)
    })
    .await
}

#[tauri::command]
pub async fn remote_rollback_deploy(
    app: AppHandle,
    id: String,
    deploy_id: String,
) -> AppResult<DeployResult> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let host = state.read()?.host(&id)?.clone();
        let record = {
            let d = state
                .deploys
                .lock()
                .map_err(|_| AppError::Io("deploys poisoned".into()))?;
            d.get(&deploy_id)
                .cloned()
                .ok_or_else(|| AppError::NotFound(format!("deploy record {deploy_id}")))?
        };

        confirm_action(
            &app,
            &format!("Roll back {} to {}?", host.label, record.id),
            &format!(
                "This will restore previous image digests and restart services for stack '{}'.",
                record.project
            ),
            "Roll Back",
            host.env == Env::Prod,
        )?;

        let target = state.target(&id)?;
        let res = deploys::rollback_deploy(&target, &record)?;

        let mut d = state
            .deploys
            .lock()
            .map_err(|_| AppError::Io("deploys poisoned".into()))?;
        d.add(res.record.clone());
        let dir = state.path.parent().unwrap_or(&state.path);
        d.save(dir)?;

        Ok(res)
    })
    .await
}

#[tauri::command]
pub async fn remote_get_deploys(app: AppHandle, id: String) -> AppResult<Vec<DeployRecord>> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let d = state
            .deploys
            .lock()
            .map_err(|_| AppError::Io("deploys poisoned".into()))?;
        Ok(d.history_for(&id))
    })
    .await
}

#[tauri::command]
pub async fn remote_promote_env(
    app: AppHandle,
    source_id: String,
    target_id: String,
    project: String,
) -> AppResult<DeployResult> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let source_host = state.read()?.host(&source_id)?.clone();
        let target_host = state.read()?.host(&target_id)?.clone();

        confirm_action(
            &app,
            &format!("Promote {} to {}?", source_host.label, target_host.label),
            &format!("This will promote and deploy the image configuration of '{}' from {} ({:?}) to {} ({:?}).", project, source_host.label, source_host.env, target_host.label, target_host.env),
            "Promote Environment",
            target_host.env == Env::Prod,
        )?;

        let target_ssh = state.target(&target_id)?;
        let res = deploys::execute_deploy(&target_ssh, &target_id, &project, vec![])?;

        let mut d = state
            .deploys
            .lock()
            .map_err(|_| AppError::Io("deploys poisoned".into()))?;
        d.add(res.record.clone());
        let dir = state.path.parent().unwrap_or(&state.path);
        d.save(dir)?;

        Ok(res)
    })
    .await
}

#[tauri::command]
pub async fn remote_push_image(
    app: AppHandle,
    id: String,
    image: String,
) -> AppResult<TeleportResult> {
    blocking(move || {
        let state = app.state::<RemoteState>();
        let host = state.read()?.host(&id)?.clone();
        let target = state.target(&id)?;
        teleport::teleport_image(&host, &target, &image)
    })
    .await
}
