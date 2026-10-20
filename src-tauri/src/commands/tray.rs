use crate::models::tray::{TrayServer, TrayService};
use tauri::AppHandle;

#[tauri::command]
pub fn set_tray_services(services: Vec<TrayService>, app: AppHandle) {
    crate::services::tray::set_tray_services(services, app);
}

#[tauri::command]
pub fn set_tray_title(title: String, app: AppHandle) {
    crate::services::tray::set_tray_title(title, app);
}

#[tauri::command]
pub fn set_tray_servers(servers: Vec<TrayServer>, app: AppHandle) {
    crate::services::tray::set_tray_servers(servers, app);
}
