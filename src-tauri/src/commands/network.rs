// Tauri IPC commands for Network & Hosts (P12.3).

use crate::error::{AppError, AppResult};
use crate::services::network::{self, HostEntry, NetworkInfo, ProcessBandwidth};
use tauri::{AppHandle, Manager};

use super::blocking;

#[tauri::command]
pub async fn network_get_interfaces() -> AppResult<NetworkInfo> {
    blocking(network::get_network_info).await
}

#[tauri::command]
pub async fn network_get_bandwidth() -> AppResult<Vec<ProcessBandwidth>> {
    blocking(network::get_per_app_bandwidth).await
}

#[tauri::command]
pub async fn network_flush_dns() -> AppResult<String> {
    blocking(network::flush_dns_cache).await
}

#[tauri::command]
pub async fn network_get_hosts() -> AppResult<Vec<HostEntry>> {
    blocking(network::read_hosts_file).await
}

use crate::core::mutation::{mutation_unattended, BlastRadius, MutationSpec};

#[tauri::command]
pub async fn network_save_hosts(app: AppHandle, entries: Vec<HostEntry>) -> AppResult<()> {
    let _guard = mutation_unattended(
        MutationSpec::new(
            "Update /etc/hosts",
            format!("Modify {} host mapping(s) in /etc/hosts", entries.len()),
            "save_hosts",
        )
        .blast_radius(BlastRadius::LocalSystem)
        .target("/etc/hosts")
        .destructive(true),
    );

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(format!("data dir: {e}")))?;
    blocking(move || network::save_hosts_file(&dir, &entries)).await
}

#[tauri::command]
pub async fn network_restore_hosts(app: AppHandle) -> AppResult<()> {
    let _guard = mutation_unattended(
        MutationSpec::new(
            "Restore /etc/hosts",
            "Restore /etc/hosts from the most recent backup",
            "restore_hosts",
        )
        .blast_radius(BlastRadius::LocalSystem)
        .target("/etc/hosts")
        .destructive(true),
    );

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(format!("data dir: {e}")))?;
    blocking(move || network::hosts::restore_previous_hosts(&dir)).await
}
