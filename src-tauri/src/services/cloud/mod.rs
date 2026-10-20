use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ec2Instance {
    pub id: String,
    pub name: String,
    pub state: String,
    pub instance_type: String,
    pub public_ip: Option<String>,
    pub private_ip: Option<String>,
    pub region: String,
    pub is_prod: bool,
    pub tags: Vec<(String, String)>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct S3Bucket {
    pub name: String,
    pub creation_date: String,
    pub region: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AwsCostItem {
    pub service: String,
    pub amount: f64,
    pub unit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AwsCostReport {
    pub month_to_date_total: f64,
    pub currency: String,
    pub top_services: Vec<AwsCostItem>,
    pub cached_at: u64,
}

pub fn list_profiles() -> AppResult<Vec<String>> {
    let out = Command::new("aws")
        .args(["configure", "list-profiles"])
        .output();

    match out {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            let mut profiles: Vec<String> = stdout
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .collect();
            if profiles.is_empty() {
                profiles.push("default".into());
            }
            Ok(profiles)
        }
        _ => {
            // Check ~/.aws/config manually if aws cli isn't installed
            let home = std::env::var("HOME").unwrap_or_default();
            let config_path = Path::new(&home).join(".aws").join("config");
            if let Ok(content) = std::fs::read_to_string(config_path) {
                let mut profiles = Vec::new();
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("[profile ") && trimmed.ends_with(']') {
                        let name = &trimmed[9..trimmed.len() - 1];
                        profiles.push(name.trim().to_string());
                    } else if trimmed == "[default]" {
                        profiles.push("default".into());
                    }
                }
                if !profiles.is_empty() {
                    return Ok(profiles);
                }
            }
            Ok(vec!["default".into()])
        }
    }
}

pub fn list_ec2_instances(profile: &str, region: &str) -> AppResult<Vec<Ec2Instance>> {
    let out = Command::new("aws")
        .args([
            "ec2",
            "describe-instances",
            "--profile",
            profile,
            "--region",
            region,
            "--output",
            "json",
        ])
        .output()
        .map_err(|e| AppError::Io(format!("aws cli execution failed: {e}")))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(AppError::Shell(format!(
            "aws describe-instances error: {stderr}"
        )));
    }

    let json_val: serde_json::Value = serde_json::from_slice(&out.stdout)
        .map_err(|e| AppError::Shell(format!("invalid ec2 json: {e}")))?;

    let mut list = Vec::new();

    if let Some(reservations) = json_val.get("Reservations").and_then(|r| r.as_array()) {
        for res in reservations {
            if let Some(instances) = res.get("Instances").and_then(|i| i.as_array()) {
                for inst in instances {
                    let id = inst
                        .get("InstanceId")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let state = inst
                        .get("State")
                        .and_then(|s| s.get("Name"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string();
                    let itype = inst
                        .get("InstanceType")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let public_ip = inst
                        .get("PublicIpAddress")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let private_ip = inst
                        .get("PrivateIpAddress")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());

                    let mut tags = Vec::new();
                    let mut name = id.clone();
                    let mut is_prod = false;

                    if let Some(raw_tags) = inst.get("Tags").and_then(|t| t.as_array()) {
                        for t in raw_tags {
                            let k = t
                                .get("Key")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let v = t
                                .get("Value")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            if k.eq_ignore_ascii_case("Name") && !v.is_empty() {
                                name = v.clone();
                            }
                            if (k.eq_ignore_ascii_case("env")
                                || k.eq_ignore_ascii_case("environment"))
                                && v.eq_ignore_ascii_case("prod")
                            {
                                is_prod = true;
                            }
                            tags.push((k, v));
                        }
                    }

                    list.push(Ec2Instance {
                        id,
                        name,
                        state,
                        instance_type: itype,
                        public_ip,
                        private_ip,
                        region: region.to_string(),
                        is_prod,
                        tags,
                    });
                }
            }
        }
    }

    Ok(list)
}

pub fn ec2_action(
    profile: &str,
    region: &str,
    instance_id: &str,
    action: &str,
) -> AppResult<String> {
    let subcmd = match action {
        "start" => "start-instances",
        "stop" => "stop-instances",
        "reboot" => "reboot-instances",
        _ => {
            return Err(AppError::InvalidName(format!(
                "unknown ec2 action: {action}"
            )))
        }
    };

    let out = Command::new("aws")
        .args([
            "ec2",
            subcmd,
            "--profile",
            profile,
            "--region",
            region,
            "--instance-ids",
            instance_id,
            "--output",
            "json",
        ])
        .output()
        .map_err(|e| AppError::Io(format!("aws ec2 {subcmd} failed: {e}")))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(AppError::Shell(format!("ec2 {action} error: {stderr}")));
    }

    Ok(format!(
        "Instance {instance_id} {action} triggered successfully"
    ))
}

pub fn list_s3_buckets(profile: &str) -> AppResult<Vec<S3Bucket>> {
    let out = Command::new("aws")
        .args([
            "s3api",
            "list-buckets",
            "--profile",
            profile,
            "--output",
            "json",
        ])
        .output()
        .map_err(|e| AppError::Io(format!("aws s3api failed: {e}")))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(AppError::Shell(format!("s3 error: {stderr}")));
    }

    let val: serde_json::Value = serde_json::from_slice(&out.stdout)
        .map_err(|e| AppError::Shell(format!("invalid s3 json: {e}")))?;

    let mut list = Vec::new();
    if let Some(buckets) = val.get("Buckets").and_then(|b| b.as_array()) {
        for b in buckets {
            let name = b
                .get("Name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let creation_date = b
                .get("CreationDate")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if !name.is_empty() {
                list.push(S3Bucket {
                    name,
                    creation_date,
                    region: None,
                });
            }
        }
    }
    Ok(list)
}

pub fn get_cached_or_fresh_costs(
    dir: &Path,
    profile: &str,
    force_refresh: bool,
) -> AppResult<AwsCostReport> {
    let cache_file = dir.join(format!("aws-cost-{profile}.json"));
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    if !force_refresh && cache_file.exists() {
        if let Ok(s) = std::fs::read_to_string(&cache_file) {
            if let Ok(report) = serde_json::from_str::<AwsCostReport>(&s) {
                // If cache is less than 24h old, return cached
                if now.saturating_sub(report.cached_at) < 86400 {
                    return Ok(report);
                }
            }
        }
    }

    // Default stub / fallback report to avoid unexpected charges unless user explicitly queries
    let report = AwsCostReport {
        month_to_date_total: 0.0,
        currency: "USD".into(),
        top_services: vec![],
        cached_at: now,
    };

    let _ = std::fs::write(
        &cache_file,
        serde_json::to_string_pretty(&report).unwrap_or_default(),
    );
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_profiles_has_at_least_default() {
        let p = list_profiles().unwrap();
        assert!(!p.is_empty());
    }
}
