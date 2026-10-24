// Tauri IPC commands for AWS Cloud (P12.1).

use crate::error::{AppError, AppResult};
use crate::services::cloud::{self, AwsCostReport, Ec2Instance, S3Bucket};
use tauri::{AppHandle, Manager};

use super::blocking;

#[tauri::command]
pub async fn aws_list_profiles() -> AppResult<Vec<String>> {
    crate::core::consent::require_consent(crate::core::consent::DataSource::AwsConfig)?;
    blocking(cloud::list_profiles).await
}

#[tauri::command]
pub async fn aws_list_ec2_instances(
    profile: String,
    region: Option<String>,
) -> AppResult<Vec<Ec2Instance>> {
    crate::core::consent::require_consent(crate::core::consent::DataSource::AwsConfig)?;
    blocking(move || {
        let region = cloud::resolve_region(&profile, region.as_deref())?;
        crate::core::net::check_outbound_allowed(&format!("ec2.{region}.amazonaws.com"))?;
        cloud::list_ec2_instances(&profile, &region)
    })
    .await
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
    crate::core::consent::require_consent(crate::core::consent::DataSource::AwsConfig)?;
    let p_clone = profile.clone();
    let r_clone = region.clone();
    let id_clone = instance_id.clone();

    let is_prod = blocking(move || cloud::get_instance_is_prod(&p_clone, &r_clone, &id_clone))
        .await
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

    blocking(move || cloud::ec2_action(&profile, &region, &instance_id, &action)).await
}

#[tauri::command]
pub async fn aws_get_costs(
    app: AppHandle,
    profile: String,
    force_refresh: Option<bool>,
) -> AppResult<AwsCostReport> {
    crate::core::consent::require_consent(crate::core::consent::DataSource::AwsConfig)?;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(format!("data dir: {e}")))?;
    let force = force_refresh.unwrap_or(false);
    blocking(move || cloud::get_cached_or_fresh_costs(&dir, &profile, force)).await
}

#[tauri::command]
pub async fn aws_list_s3_buckets(profile: String) -> AppResult<Vec<S3Bucket>> {
    crate::core::consent::require_consent(crate::core::consent::DataSource::AwsConfig)?;
    blocking(move || cloud::list_s3_buckets(&profile)).await
}
