// Remote (Servers) commands — thin wrappers over `crate::remote`. The frontend
// only ever sends a host `id` (plus display fields); hostnames, users and
// aliases are resolved and validated here (docs/remote/PLAN.md §4.10).

use super::{blocking, confirm_action};
use crate::error::{AppError, AppResult};
use crate::remote::docker::{self, DockerAction};
use crate::remote::probe::{self, HostSnapshot};
use crate::remote::store::JournalEntry;
use crate::remote::store::{
    new_host_id, Consent, Env, Host, HostSource, ManualTarget, DEFAULT_PROJECT,
};
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
}

#[tauri::command]
pub async fn remote_state(app: AppHandle) -> AppResult<RemoteStateDto> {
    blocking(move || {
        let s = app.state::<RemoteState>();
        let s = s.read()?;
        Ok(RemoteStateDto {
            consent: s.consent.clone(),
            hosts: s.hosts.clone(),
        })
    })
    .await
}

/// Revoking also closes every open connection; imported hosts are kept.
#[tauri::command]
pub async fn remote_set_consent(app: AppHandle, granted: bool) -> AppResult<()> {
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
