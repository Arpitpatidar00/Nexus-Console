use crate::models::tray::TrayService;
use tauri::AppHandle;

#[tauri::command]
pub fn set_tray_services(services: Vec<TrayService>, app: AppHandle) {
    crate::services::tray::set_tray_services(services, app);
}

#[tauri::command]
pub fn set_tray_title(title: String, app: AppHandle) {
    crate::services::tray::set_tray_title(title, app);
}
