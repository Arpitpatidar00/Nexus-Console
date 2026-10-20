use crate::error::AppResult;
use crate::services::devices::{self, AndroidAvd, IosSimulator};

#[tauri::command]
pub async fn devices_list_ios() -> AppResult<Vec<IosSimulator>> {
    devices::list_ios_simulators()
}

#[tauri::command]
pub async fn devices_control_ios(udid: String, action: String) -> AppResult<String> {
    devices::control_ios_simulator(&udid, &action)
}

#[tauri::command]
pub async fn devices_list_android() -> AppResult<Vec<AndroidAvd>> {
    devices::list_android_avds()
}

#[tauri::command]
pub async fn devices_launch_android(name: String) -> AppResult<String> {
    devices::launch_android_avd(&name)
}
