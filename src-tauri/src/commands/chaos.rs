// Tauri IPC commands for Chaos Proxy (P12.4).

use crate::error::AppResult;
use crate::services::chaos::{self, ChaosProfile, ChaosProxyInfo};

#[tauri::command]
pub async fn chaos_start_proxy(
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
    // Return proxy metadata
    Ok(ChaosProxyInfo {
        id: format!("chaos_{chaos_port}"),
        target_port,
        chaos_port,
        profile,
        active: true,
    })
}

#[tauri::command]
pub async fn chaos_simulate(profile: ChaosProfile) -> AppResult<bool> {
    chaos::simulate_chaos(&profile)
}
