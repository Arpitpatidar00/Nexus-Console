// Tauri IPC commands for AWS Cloud (P12.1).

use crate::error::{AppError, AppResult};
use crate::services::cloud::{self, AwsCostReport, Ec2Instance, S3Bucket};
use tauri::{AppHandle, Manager};

fn blocking<F, T>(f: F) -> tauri::async_runtime::JoinHandle<T>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
}

#[tauri::command]
pub async fn aws_list_profiles() -> AppResult<Vec<String>> {
    blocking(cloud::list_profiles)
        .await
        .map_err(|e| AppError::Shell(format!("list aws profiles task: {e}")))?
}

#[tauri::command]
pub async fn aws_list_ec2_instances(
    profile: String,
    region: String,
) -> AppResult<Vec<Ec2Instance>> {
    blocking(move || cloud::list_ec2_instances(&profile, &region))
        .await
        .map_err(|e| AppError::Shell(format!("list ec2 instances task: {e}")))?
}

use crate::core::mutation::{mutation, MutationSpec};

#[tauri::command]
pub async fn aws_instance_action(
    app: AppHandle,
    profile: String,
    region: String,
    instance_id: String,
    action: String,
) -> AppResult<String> {
    let p_clone = profile.clone();
    let r_clone = region.clone();
    let id_clone = instance_id.clone();

    let is_prod = blocking(move || cloud::get_instance_is_prod(&p_clone, &r_clone, &id_clone))
        .await
        .map_err(|e| AppError::Shell(format!("check ec2 tags task: {e}")))?
        .unwrap_or(false);

    let is_destructive = is_prod || action == "stop" || action == "reboot";
    let spec = MutationSpec::new(
        format!("EC2 {}: {}", action, instance_id),
        format!(
            "Perform '{}' on AWS EC2 instance {} ({}/{})",
            action, instance_id, profile, region
        ),
        format!("ec2_{action}"),
    )
    .target(&instance_id)
    .destructive(is_destructive)
    .prod(is_prod);

    let _guard = mutation(&app, spec)?;

    blocking(move || cloud::ec2_action(&profile, &region, &instance_id, &action))
        .await
        .map_err(|e| AppError::Shell(format!("ec2 action task: {e}")))?
}

#[tauri::command]
pub async fn aws_get_costs(
    app: AppHandle,
    profile: String,
    force_refresh: Option<bool>,
) -> AppResult<AwsCostReport> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(format!("data dir: {e}")))?;
    let force = force_refresh.unwrap_or(false);
    blocking(move || cloud::get_cached_or_fresh_costs(&dir, &profile, force))
        .await
        .map_err(|e| AppError::Shell(format!("aws cost task: {e}")))?
}

#[tauri::command]
pub async fn aws_list_s3_buckets(profile: String) -> AppResult<Vec<S3Bucket>> {
    blocking(move || cloud::list_s3_buckets(&profile))
        .await
        .map_err(|e| AppError::Shell(format!("list s3 buckets task: {e}")))?
}
