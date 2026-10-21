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

use crate::core::exec::{self, ExecOpts};
use crate::core::validate::{AwsProfile, AwsRegion, Ec2InstanceId};
use std::time::Duration;

pub fn parse_ec2_instances_json(stdout: &[u8], region: &str) -> AppResult<Vec<Ec2Instance>> {
    let json_val: serde_json::Value = serde_json::from_slice(stdout)
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

pub fn list_ec2_instances(profile: &str, region: &str) -> AppResult<Vec<Ec2Instance>> {
    let p = AwsProfile::try_from(profile)?;
    let r = AwsRegion::try_from(region)?;

    let opts = ExecOpts::default().with_timeout(Duration::from_secs(30));
    let out = exec::run(
        "aws",
        &[
            "ec2",
            "describe-instances",
            "--profile",
            p.as_str(),
            "--region",
            r.as_str(),
            "--output",
            "json",
        ],
        opts,
    )?;

    parse_ec2_instances_json(&out.stdout, r.as_str())
}

pub fn get_instance_is_prod(profile: &str, region: &str, instance_id: &str) -> AppResult<bool> {
    let p = AwsProfile::try_from(profile)?;
    let r = AwsRegion::try_from(region)?;
    let inst = Ec2InstanceId::try_from(instance_id)?;

    let opts = ExecOpts::default().with_timeout(Duration::from_secs(30));
    let out = exec::run(
        "aws",
        &[
            "ec2",
            "describe-instances",
            "--profile",
            p.as_str(),
            "--region",
            r.as_str(),
            "--instance-ids",
            inst.as_str(),
            "--output",
            "json",
        ],
        opts,
    )?;

    let list = parse_ec2_instances_json(&out.stdout, r.as_str())?;
    let is_prod = list
        .iter()
        .find(|i| i.id == inst.as_str())
        .map(|i| i.is_prod)
        .unwrap_or(false);

    Ok(is_prod)
}

pub fn ec2_action(
    profile: &str,
    region: &str,
    instance_id: &str,
    action: &str,
) -> AppResult<String> {
    let p = AwsProfile::try_from(profile)?;
    let r = AwsRegion::try_from(region)?;
    let inst = Ec2InstanceId::try_from(instance_id)?;

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

    let opts = ExecOpts::default().with_timeout(Duration::from_secs(45));
    let out = exec::run(
        "aws",
        &[
            "ec2",
            subcmd,
            "--profile",
            p.as_str(),
            "--region",
            r.as_str(),
            "--instance-ids",
            inst.as_str(),
            "--output",
            "json",
        ],
        opts,
    )?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(AppError::Shell(format!("ec2 {action} error: {stderr}")));
    }

    Ok(format!(
        "Instance {} {action} triggered successfully",
        inst.as_str()
    ))
}

pub fn list_s3_buckets(profile: &str) -> AppResult<Vec<S3Bucket>> {
    let p = AwsProfile::try_from(profile)?;
    let opts = ExecOpts::default().with_timeout(Duration::from_secs(30));
    let out = exec::run(
        "aws",
        &[
            "s3api",
            "list-buckets",
            "--profile",
            p.as_str(),
            "--output",
            "json",
        ],
        opts,
    )?;

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

fn date_from_days(days_since_epoch: u64) -> (i64, u32, u32) {
    let z = days_since_epoch as i64 + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m as u32, d as u32)
}

pub fn parse_cost_explorer_json(json_str: &str, now: u64) -> AppResult<AwsCostReport> {
    let root: serde_json::Value = serde_json::from_str(json_str)
        .map_err(|e| AppError::Io(format!("failed to parse AWS Cost Explorer JSON: {e}")))?;

    let mut total = 0.0;
    let mut currency = "USD".to_string();
    let mut services = Vec::new();

    if let Some(results) = root.get("ResultsByTime").and_then(|r| r.as_array()) {
        for period in results {
            if let Some(groups) = period.get("Groups").and_then(|g| g.as_array()) {
                for group in groups {
                    let svc_name = group
                        .get("Keys")
                        .and_then(|k| k.get(0))
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unknown")
                        .to_string();

                    let amount = group
                        .get("Metrics")
                        .and_then(|m| m.get("UnblendedCost"))
                        .and_then(|u| u.get("Amount"))
                        .and_then(|a| a.as_str())
                        .and_then(|s| s.parse::<f64>().ok())
                        .unwrap_or(0.0);

                    if let Some(u) = group
                        .get("Metrics")
                        .and_then(|m| m.get("UnblendedCost"))
                        .and_then(|u| u.get("Unit"))
                        .and_then(|u| u.as_str())
                    {
                        currency = u.to_string();
                    }

                    if amount > 0.001 {
                        total += amount;
                        services.push(AwsCostItem {
                            service: svc_name,
                            amount: (amount * 100.0).round() / 100.0,
                            unit: currency.clone(),
                        });
                    }
                }
            }
        }
    }

    services.sort_by(|a, b| {
        b.amount
            .partial_cmp(&a.amount)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    services.truncate(10);

    Ok(AwsCostReport {
        month_to_date_total: (total * 100.0).round() / 100.0,
        currency,
        top_services: services,
        cached_at: now,
    })
}

pub fn get_cached_or_fresh_costs(
    dir: &Path,
    profile: &str,
    force_refresh: bool,
) -> AppResult<AwsCostReport> {
    let p = AwsProfile::try_from(profile)?;
    let cache_file = dir.join(format!("aws-cost-{}.json", p.as_str()));
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    if !force_refresh && cache_file.exists() {
        if let Ok(s) = std::fs::read_to_string(&cache_file) {
            if let Ok(report) = serde_json::from_str::<AwsCostReport>(&s) {
                return Ok(report);
            }
        }
    }

    if !force_refresh {
        // Automatic queries are disabled: only query Cost Explorer when user explicitly requests refresh
        return Ok(AwsCostReport {
            month_to_date_total: 0.0,
            currency: "USD".into(),
            top_services: vec![],
            cached_at: 0,
        });
    }

    // Real AWS Cost Explorer invocation with explicit time period
    let days = now / 86400;
    let (y, m, _) = date_from_days(days);
    let start_date = format!("{y:04}-{m:02}-01");
    let (end_y, end_m, end_d) = date_from_days(days + 1);
    let end_date = format!("{end_y:04}-{end_m:02}-{end_d:02}");
    let time_period = format!("Start={start_date},End={end_date}");

    let opts =
        crate::core::exec::ExecOpts::default().with_timeout(std::time::Duration::from_secs(30));
    let out = crate::core::exec::run(
        "aws",
        &[
            "--profile",
            p.as_str(),
            "ce",
            "get-cost-and-usage",
            "--time-period",
            &time_period,
            "--granularity",
            "MONTHLY",
            "--metrics",
            "UnblendedCost",
            "--group-by",
            "Type=DIMENSION,Key=SERVICE",
            "--output",
            "json",
        ],
        opts,
    )?;

    let json_str = String::from_utf8_lossy(&out.stdout);
    let report = parse_cost_explorer_json(&json_str, now)?;

    let _ = std::fs::write(
        &cache_file,
        serde_json::to_string_pretty(&report).unwrap_or_default(),
    );
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE_EC2_JSON: &[u8] = br#"{
        "Reservations": [
            {
                "Instances": [
                    {
                        "InstanceId": "i-0123456789abcdef0",
                        "InstanceType": "t3.medium",
                        "State": { "Name": "running" },
                        "PublicIpAddress": "54.12.34.56",
                        "PrivateIpAddress": "10.0.1.20",
                        "Tags": [
                            { "Key": "Name", "Value": "prod-api-server" },
                            { "Key": "Environment", "Value": "prod" }
                        ]
                    },
                    {
                        "InstanceId": "i-12345678",
                        "InstanceType": "t3.micro",
                        "State": { "Name": "stopped" },
                        "PrivateIpAddress": "10.0.2.15",
                        "Tags": [
                            { "Key": "Name", "Value": "staging-worker" },
                            { "Key": "env", "Value": "staging" }
                        ]
                    }
                ]
            }
        ]
    }"#;

    #[test]
    fn test_list_profiles_has_at_least_default() {
        let p = list_profiles().unwrap();
        assert!(!p.is_empty());
    }

    #[test]
    fn test_parse_ec2_instances_fixture() {
        let instances = parse_ec2_instances_json(FIXTURE_EC2_JSON, "us-east-1").unwrap();
        assert_eq!(instances.len(), 2);

        // First instance: prod
        assert_eq!(instances[0].id, "i-0123456789abcdef0");
        assert_eq!(instances[0].name, "prod-api-server");
        assert_eq!(instances[0].state, "running");
        assert!(instances[0].is_prod);
        assert_eq!(instances[0].public_ip, Some("54.12.34.56".to_string()));

        // Second instance: non-prod
        assert_eq!(instances[1].id, "i-12345678");
        assert_eq!(instances[1].name, "staging-worker");
        assert_eq!(instances[1].state, "stopped");
        assert!(!instances[1].is_prod);
    }

    #[test]
    fn test_ec2_action_validation() {
        // Unknown action rejected
        let res = ec2_action("default", "us-east-1", "i-12345678", "terminate");
        assert!(res.is_err());

        // Injection payload in instance_id rejected
        let res = ec2_action("default", "us-east-1", "i-12345678; rm -rf", "start");
        assert!(res.is_err());

        // Invalid region rejected
        let res = ec2_action("default", "us-east-1; id", "i-12345678", "start");
        assert!(res.is_err());
    }

    #[test]
    fn test_parse_cost_explorer_fixture() {
        let fixture = r#"{
            "ResultsByTime": [
                {
                    "TimePeriod": {
                        "Start": "2026-10-01",
                        "End": "2026-10-22"
                    },
                    "Groups": [
                        {
                            "Keys": ["Amazon Elastic Compute Cloud - Compute"],
                            "Metrics": {
                                "UnblendedCost": {
                                    "Amount": "14.25",
                                    "Unit": "USD"
                                }
                            }
                        },
                        {
                            "Keys": ["Amazon Simple Storage Service"],
                            "Metrics": {
                                "UnblendedCost": {
                                    "Amount": "2.10",
                                    "Unit": "USD"
                                }
                            }
                        }
                    ]
                }
            ]
        }"#;

        let report = parse_cost_explorer_json(fixture, 1729500000).unwrap();
        assert_eq!(report.month_to_date_total, 16.35);
        assert_eq!(report.currency, "USD");
        assert_eq!(report.top_services.len(), 2);
        assert_eq!(
            report.top_services[0].service,
            "Amazon Elastic Compute Cloud - Compute"
        );
        assert_eq!(report.top_services[0].amount, 14.25);
        assert_eq!(
            report.top_services[1].service,
            "Amazon Simple Storage Service"
        );
        assert_eq!(report.top_services[1].amount, 2.10);
    }
}
