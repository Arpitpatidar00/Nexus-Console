// Tauri IPC commands for Domains & Uptime (P11.2).

use crate::error::{AppError, AppResult};
use crate::services::domains::{
    self,
    uptime::{self, UptimeMonitor, UptimePing, UptimeStore},
    DnsLookupResult, PropagationResult, RdapResult, SslCertResult,
};
use tauri::{AppHandle, Manager};

use super::blocking;

#[tauri::command]
pub async fn domains_lookup_dns(domain: String, record_type: String) -> AppResult<DnsLookupResult> {
    blocking(move || domains::lookup_dns(&domain, &record_type)).await
}

#[tauri::command]
pub async fn domains_check_ssl(domain: String, port: Option<u16>) -> AppResult<SslCertResult> {
    let p = port.unwrap_or(443);
    blocking(move || domains::check_ssl(&domain, p)).await
}

#[tauri::command]
pub async fn domains_check_rdap(domain: String) -> AppResult<RdapResult> {
    blocking(move || domains::check_rdap(&domain)).await
}

#[tauri::command]
pub async fn domains_check_propagation(
    domain: String,
    record_type: String,
) -> AppResult<PropagationResult> {
    blocking(move || domains::check_propagation(&domain, &record_type)).await
}

#[tauri::command]
pub async fn uptime_list_monitors(app: AppHandle) -> AppResult<Vec<UptimeMonitor>> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(format!("data dir: {e}")))?;
    blocking(move || {
        let store = UptimeStore::load(&dir);
        Ok(store.monitors)
    })
    .await
}

#[tauri::command]
pub async fn uptime_save_monitor(
    app: AppHandle,
    monitor: UptimeMonitor,
) -> AppResult<Vec<UptimeMonitor>> {
    let _guard = crate::core::mutation::mutation_unattended(
        crate::core::mutation::MutationSpec::new(
            "Save Uptime Monitor",
            format!("Save uptime monitor for '{}'", monitor.name),
            "uptime_save_monitor",
        )
        .blast_radius(crate::core::mutation::BlastRadius::LocalIsolated)
        .target(&monitor.name),
    );
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(format!("data dir: {e}")))?;
    blocking(move || {
        let mut store = UptimeStore::load(&dir);
        store.add_or_update(monitor);
        store.save(&dir)?;
        Ok(store.monitors)
    })
    .await
}

#[tauri::command]
pub async fn uptime_delete_monitor(app: AppHandle, id: String) -> AppResult<Vec<UptimeMonitor>> {
    super::confirm_action(
        &app,
        "Delete uptime monitor?",
        "This will permanently remove the uptime monitor and all historical ping data.",
        "Delete Monitor",
        true,
    )?;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(format!("data dir: {e}")))?;
    blocking(move || {
        let mut store = UptimeStore::load(&dir);
        store.delete(&id);
        store.save(&dir)?;
        Ok(store.monitors)
    })
    .await
}

#[tauri::command]
pub async fn uptime_ping_now(
    app: AppHandle,
    id: Option<String>,
    url: String,
) -> AppResult<UptimePing> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(format!("data dir: {e}")))?;
    blocking(move || {
        let ping = uptime::ping_target(&url);
        if let Some(mon_id) = id {
            let mut store = UptimeStore::load(&dir);
            store.record_ping(&mon_id, ping.clone());
            let _ = store.save(&dir);
        }
        Ok(ping)
    })
    .await
}
