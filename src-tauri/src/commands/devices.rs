use crate::core::error::{AppError, AppResult};
use crate::core::mutation::{mutation, BlastRadius, MutationSpec};
use crate::core::validate::{check_avd_name, check_sim_udid};
use crate::services::devices::{self, AndroidAvd, IosSimulator};
use tauri::AppHandle;

fn blocking<F, T>(f: F) -> tauri::async_runtime::JoinHandle<T>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
}

#[tauri::command]
pub async fn devices_list_ios() -> AppResult<Vec<IosSimulator>> {
    blocking(devices::list_ios_simulators)
        .await
        .map_err(|e| AppError::Shell(format!("list ios task: {e}")))?
}

#[tauri::command]
pub async fn devices_control_ios(
    app: AppHandle,
    udid: String,
    action: String,
) -> AppResult<String> {
    check_sim_udid(&udid)?;
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
                "devices_control_ios",
            )
            .destructive(true)
            .blast_radius(BlastRadius::LocalSystem)
            .target(&udid),
        )?;
    }

    blocking(move || devices::control_ios_simulator(&udid, &action))
        .await
        .map_err(|e| AppError::Shell(format!("control ios task: {e}")))?
}

#[tauri::command]
pub async fn devices_list_android() -> AppResult<Vec<AndroidAvd>> {
    blocking(devices::list_android_avds)
        .await
        .map_err(|e| AppError::Shell(format!("list android task: {e}")))?
}

#[tauri::command]
pub async fn devices_launch_android(name: String) -> AppResult<String> {
    check_avd_name(&name)?;
    blocking(move || devices::launch_android_avd(&name))
        .await
        .map_err(|e| AppError::Shell(format!("launch android task: {e}")))?
}

#[tauri::command]
pub async fn devices_get_logcat(
    serial: Option<String>,
    max_lines: Option<usize>,
) -> AppResult<Vec<String>> {
    let lines = max_lines.unwrap_or(200);
    blocking(move || devices::get_logcat(serial.as_deref(), lines))
        .await
        .map_err(|e| AppError::Shell(format!("logcat task: {e}")))?
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
            "devices_install_apk",
        )
        .blast_radius(BlastRadius::LocalSystem)
        .target(&apk_path),
    )?;

    blocking(move || devices::install_apk(&apk_path, serial.as_deref()))
        .await
        .map_err(|e| AppError::Shell(format!("install apk task: {e}")))?
}
