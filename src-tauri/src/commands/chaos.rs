// Tauri IPC commands for Chaos Proxy (P12.4).

use tauri::State;

use crate::error::AppResult;
use crate::services::chaos::{self, ChaosManager, ChaosProfile, ChaosProxyInfo};

#[tauri::command]
pub async fn chaos_start_proxy(
    mgr: State<'_, ChaosManager>,
    target_port: u16,
    chaos_port: u16,
    profile: ChaosProfile,
) -> AppResult<ChaosProxyInfo> {
    let _guard = crate::core::mutation::mutation_unattended(
        crate::core::mutation::MutationSpec::new(
            "Start Chaos Proxy",
            format!("Start chaos proxy on :{chaos_port} -> :{target_port}"),
            "chaos_start_proxy",
        )
        .blast_radius(crate::core::mutation::BlastRadius::LocalIsolated),
    );
    mgr.start_proxy(target_port, chaos_port, profile).await
}

#[tauri::command]
pub async fn chaos_stop_proxy(mgr: State<'_, ChaosManager>, id: String) -> AppResult<()> {
    let _guard = crate::core::mutation::mutation_unattended(
        crate::core::mutation::MutationSpec::new(
            "Stop Chaos Proxy",
            format!("Stop chaos proxy {id}"),
            "chaos_stop_proxy",
        )
        .blast_radius(crate::core::mutation::BlastRadius::LocalIsolated),
    );
    mgr.stop_proxy(&id).await
}

#[tauri::command]
pub async fn chaos_list_proxies(mgr: State<'_, ChaosManager>) -> AppResult<Vec<ChaosProxyInfo>> {
    Ok(mgr.list_proxies().await)
}

#[tauri::command]
pub async fn chaos_simulate(profile: ChaosProfile) -> AppResult<bool> {
    chaos::simulate_chaos(&profile)
}
