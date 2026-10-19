// Mac Clean commands — thin wrappers over `crate::maclean`. The frontend sends
// nothing but "scan" / "cancel"; every path is resolved in Rust.

use super::blocking;
use crate::context::AppContext;
use crate::error::{AppError, AppResult};
use crate::maclean::scan::{self, ScanInputs, StorageReport};
use crate::maclean::MacleanState;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager};

/// Measurement progress while a scan runs ("Library" 5/21).
pub const PROGRESS_EVENT: &str = "maclean://progress";

/// The full storage report. Read-only; streams progress; one at a time
/// (a second request while one runs gets `Busy`).
#[tauri::command]
pub async fn maclean_scan(app: AppHandle) -> AppResult<StorageReport> {
    blocking(move || {
        let state = app.state::<MacleanState>();
        let _one = state
            .scanning
            .try_lock()
            .map_err(|_| AppError::Busy("A scan is already running.".into()))?;
        state.cancel.store(false, Ordering::Relaxed);
        let rules = state.read()?.rules.clone();
        let home = crate::doctor::paths::home()
            .ok_or_else(|| AppError::NotFound("HOME not set".into()))?;
        let user = std::env::var("USER").unwrap_or_default();
        let inputs = ScanInputs {
            home,
            user,
            brew_prefix: app.state::<AppContext>().brew_prefix.clone(),
            rules: &rules,
            cancel: &state.cancel,
        };
        scan::run(&inputs, &|p| {
            let _ = app.emit(PROGRESS_EVENT, &p);
        })
    })
    .await
}

#[tauri::command]
pub async fn maclean_cancel_scan(app: AppHandle) -> AppResult<()> {
    app.state::<MacleanState>()
        .cancel
        .store(true, Ordering::Relaxed);
    Ok(())
}
