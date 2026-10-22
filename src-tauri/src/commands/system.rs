use super::blocking;
use crate::core::error::AppResult;
use crate::services::maclean::disk::{self, DiskStats};
use crate::services::tools::{self, DetectedTool};

/// Free space on the Data volume for Home's low-disk check. `None` if `df` fails.
#[tauri::command]
pub async fn system_disk_free() -> AppResult<Option<DiskStats>> {
    blocking(|| Ok(disk::disk_stats())).await
}

/// Installed developer tools, for the first-run module suggestions.
#[tauri::command]
pub async fn system_detect_tools() -> AppResult<Vec<DetectedTool>> {
    blocking(|| Ok(tools::detect())).await
}

/// The one shortcut Settings offers: ⌃⌥Space. (⌘⌥Space is Finder search.)
const TOGGLE_SHORTCUT: &str = "Control+Alt+Space";

/// Register (or clear, with `None`) the global show/hide shortcut. The setting
/// used to be saved but never registered, so the hotkey did nothing.
#[tauri::command]
pub fn system_set_global_hotkey(app: tauri::AppHandle, shortcut: Option<String>) -> AppResult<()> {
    use crate::core::error::AppError;
    use tauri::Manager;
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

    let gs = app.global_shortcut();
    gs.unregister_all()
        .map_err(|e| AppError::Io(format!("unregister shortcut: {e}")))?;
    let Some(s) = shortcut else {
        return Ok(());
    };
    if s != TOGGLE_SHORTCUT {
        return Err(AppError::InvalidName(format!("unsupported shortcut: {s}")));
    }
    let sc: Shortcut = s
        .parse()
        .map_err(|e| AppError::InvalidName(format!("shortcut {s}: {e}")))?;
    gs.on_shortcut(sc, |app, _sc, ev| {
        if ev.state != ShortcutState::Pressed {
            return;
        }
        if let Some(w) = app.get_webview_window("main") {
            let front = w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false);
            let _ = if front {
                w.hide()
            } else {
                w.show().and_then(|()| w.set_focus())
            };
        }
    })
    .map_err(|e| {
        AppError::Io(format!(
            "register shortcut {s}: {e} — another app may own it"
        ))
    })
}
