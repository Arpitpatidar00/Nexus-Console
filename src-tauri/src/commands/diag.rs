use super::blocking;
use crate::core::diag::{self, ErrorEntry, ReportInfo};
use crate::core::error::{AppError, AppResult};
use crate::core::mutation::{mutation_unattended, BlastRadius, MutationSpec};
use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AboutInfo {
    pub version: String,
    pub git_sha: String,
    pub build_epoch: u64,
    pub arch: String,
    pub macos: String,
}

fn macos_version() -> String {
    let opts =
        crate::core::exec::ExecOpts::default().with_timeout(std::time::Duration::from_secs(3));
    crate::core::exec::run("/usr/bin/sw_vers", &["-productVersion"], opts)
        .map(|o| o.stdout_str.trim().to_string())
        .unwrap_or_else(|_| "unknown".into())
}

fn about(app: &AppHandle) -> AboutInfo {
    AboutInfo {
        version: app.package_info().version.to_string(),
        git_sha: env!("STACKROOST_GIT_SHA").into(),
        build_epoch: env!("STACKROOST_BUILD_EPOCH").parse().unwrap_or(0),
        arch: std::env::consts::ARCH.into(),
        macos: macos_version(),
    }
}

/// Version + build for the About card (PLAN G.3).
#[tauri::command]
pub async fn app_about(app: AppHandle) -> AppResult<AboutInfo> {
    blocking(move || Ok(about(&app))).await
}

/// The frontend's central error handler records failures here (PLAN G.4).
#[tauri::command]
pub async fn diag_log_error(
    source: String,
    kind: String,
    message: String,
    command: Option<String>,
) -> AppResult<()> {
    if !matches!(source.as_str(), "ipc" | "ui") {
        return Err(AppError::InvalidName(format!(
            "unknown error source '{source}'"
        )));
    }
    blocking(move || {
        diag::push(ErrorEntry {
            epoch_ms: diag::now_ms(),
            source,
            kind,
            message,
            command,
        })
    })
    .await
}

#[tauri::command]
pub async fn diag_list_errors() -> AppResult<Vec<ErrorEntry>> {
    blocking(|| Ok(diag::list())).await
}

#[tauri::command]
pub async fn diag_clear_errors() -> AppResult<()> {
    let spec = MutationSpec::new(
        "Clear error log",
        "Delete the local error log",
        "diag_clear_errors",
    )
    .blast_radius(BlastRadius::LocalIsolated);
    let guard = mutation_unattended(spec);
    let res = blocking(diag::clear).await;
    if res.is_ok() {
        guard.success("cleared");
    }
    res
}

/// Plain-text report the user copies into a bug report; redacted, never sent.
#[tauri::command]
pub async fn diag_report(app: AppHandle) -> AppResult<String> {
    blocking(move || {
        let info = about(&app);
        let modules = crate::settings::read(&app)
            .and_then(|s| s.get("enabledModules").cloned())
            .and_then(|v| {
                v.as_array().map(|a| {
                    a.iter()
                        .filter_map(|m| m.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                })
            })
            .unwrap_or_else(|| "defaults".into());
        let home = std::env::var("HOME").unwrap_or_default();
        Ok(diag::report(
            &ReportInfo {
                version: &info.version,
                git_sha: &info.git_sha,
                build_epoch: info.build_epoch,
                macos: &info.macos,
                arch: &info.arch,
                modules: &modules,
            },
            &diag::list(),
            &home,
        ))
    })
    .await
}
