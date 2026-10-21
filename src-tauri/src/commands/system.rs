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
