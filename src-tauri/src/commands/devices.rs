use crate::core::error::{AppError, AppResult};
use crate::core::mutation::{mutation, BlastRadius, MutationSpec};
use crate::core::validate::{check_avd_name, check_sim_udid};
use crate::services::devices::{self, AndroidAvd, IosSimulator};
use tauri::AppHandle;

use super::blocking;

#[tauri::command]
pub async fn devices_list_ios() -> AppResult<Vec<IosSimulator>> {
    blocking(devices::list_ios_simulators).await
}

#[tauri::command]
pub async fn devices_control_ios(
    app: AppHandle,
    udid: String,
    action: String,
) -> AppResult<String> {
    // "open" launches Simulator.app and takes no device — the header button
    // sends an empty UDID, which this check used to reject every time.
    if action != "open" {
        check_sim_udid(&udid)?;
    }
    if !matches!(action.as_str(), "boot" | "shutdown" | "open" | "erase") {
        return Err(AppError::InvalidName(format!(
            "Invalid simulator action: {action}"
        )));
    }

    if action == "erase" {
        let _guard = mutation(
            &app,
            MutationSpec::new(
                "Erase Simulator",
                format!("Erase all content and settings for iOS Simulator {udid}"),
                "Erase",
            )
            .destructive(true)
            .blast_radius(BlastRadius::LocalSystem)
            .target(&udid),
        )?;
    }

    blocking(move || devices::control_ios_simulator(&udid, &action)).await
}

#[tauri::command]
pub async fn devices_list_android() -> AppResult<Vec<AndroidAvd>> {
    blocking(devices::list_android_avds).await
}

#[tauri::command]
pub async fn devices_launch_android(name: String) -> AppResult<String> {
    check_avd_name(&name)?;
    blocking(move || devices::launch_android_avd(&name)).await
}

#[tauri::command]
pub async fn devices_get_logcat(
    serial: Option<String>,
    max_lines: Option<usize>,
) -> AppResult<Vec<String>> {
    let lines = max_lines.unwrap_or(200);
    blocking(move || devices::get_logcat(serial.as_deref(), lines)).await
}

#[tauri::command]
pub async fn devices_install_apk(
    app: AppHandle,
    apk_path: String,
    serial: Option<String>,
) -> AppResult<()> {
    let _guard = mutation(
        &app,
        MutationSpec::new(
            "Install Android APK",
            format!("Install APK '{apk_path}' on device"),
            "Install",
        )
        .blast_radius(BlastRadius::LocalSystem)
        .target(&apk_path),
    )?;

    blocking(move || devices::install_apk(&apk_path, serial.as_deref())).await
}
