use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessBandwidth {
    pub process: String,
    pub pid: u32,
    pub bytes_in: u64,
    pub bytes_out: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInfo {
    pub primary_interface: String,
    pub ipv4_address: Option<String>,
    pub ipv6_address: Option<String>,
    pub dns_servers: Vec<String>,
}

pub fn get_network_info() -> AppResult<NetworkInfo> {
    let mut primary_interface = "en0".to_string();
    let mut ipv4_address = None;
    let mut ipv6_address = None;
    let mut dns_servers = Vec::new();

    // Parse scutil --nwi
    if let Ok(out) = Command::new("/usr/sbin/scutil").arg("--nwi").output() {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines() {
            let t = line.trim();
            if t.starts_with("address") {
                if let Some(ip) = t.split(':').nth(1).map(|s| s.trim().to_string()) {
                    if ip.contains('.') && ipv4_address.is_none() {
                        ipv4_address = Some(ip);
                    } else if ip.contains(':') && ipv6_address.is_none() {
                        ipv6_address = Some(ip);
                    }
                }
            } else if t.starts_with("Network interfaces:") {
                if let Some(iface) = t
                    .split(':')
                    .nth(1)
                    .and_then(|s| s.split_whitespace().next())
                {
                    primary_interface = iface.to_string();
                }
            }
        }
    }

    // Parse scutil --dns
    if let Ok(out) = Command::new("/usr/sbin/scutil").arg("--dns").output() {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines() {
            let t = line.trim();
            if t.starts_with("nameserver[") {
                if let Some(ns) = t.split(':').nth(1).map(|s| s.trim().to_string()) {
                    if !dns_servers.contains(&ns) {
                        dns_servers.push(ns);
                    }
                }
            }
        }
    }

    Ok(NetworkInfo {
        primary_interface,
        ipv4_address,
        ipv6_address,
        dns_servers,
    })
}

pub fn get_per_app_bandwidth() -> AppResult<Vec<ProcessBandwidth>> {
    let out = Command::new("/usr/bin/nettop")
        .args(["-P", "-L", "1", "-J", "bytes_in,bytes_out"])
        .output()
        .map_err(|e| AppError::Io(format!("nettop failed: {e}")))?;

    let stdout = String::from_utf8_lossy(&out.stdout);
    Ok(parse_nettop_output(&stdout))
}

pub fn parse_nettop_output(stdout: &str) -> Vec<ProcessBandwidth> {
    let mut list = Vec::new();

    for line in stdout.lines().skip(1) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let parts: Vec<&str> = trimmed.split(',').collect();
        if parts.len() >= 3 {
            let proc_str = parts[0];
            let bytes_in = parts[1].parse::<u64>().unwrap_or(0);
            let bytes_out = parts[2].parse::<u64>().unwrap_or(0);

            // proc_str format: ProcessName.PID
            if let Some(dot_idx) = proc_str.rfind('.') {
                let name = &proc_str[..dot_idx];
                let pid = proc_str[dot_idx + 1..].parse::<u32>().unwrap_or(0);
                if bytes_in > 0 || bytes_out > 0 {
                    list.push(ProcessBandwidth {
                        process: name.to_string(),
                        pid,
                        bytes_in,
                        bytes_out,
                    });
                }
            }
        }
    }

    list.sort_by_key(|a| std::cmp::Reverse(a.bytes_in + a.bytes_out));
    list.truncate(50);
    list
}

pub mod hosts;
pub use hosts::{read_hosts_file, save_hosts_file, HostEntry};

pub fn flush_dns_cache() -> AppResult<String> {
    let opts =
        crate::core::exec::ExecOpts::default().with_timeout(std::time::Duration::from_secs(10));
    // dscacheutil's flush is the one that matters, and a failure here is real
    // — propagate it.
    crate::core::exec::run("/usr/bin/dscacheutil", &["-flushcache"], opts.clone())?;

    // `killall -HUP mDNSResponder` additionally resets the resolver daemon,
    // but macOS refuses to let a non-root user signal it ("No matching
    // processes belonging to you were found", exit 1) — it fails every time
    // this app runs it. Propagating that with `?` turned a successful flush
    // into a reported failure for every user (AUDIT-2026-10-24 T-31); say so
    // honestly instead of either hiding it or failing the whole operation.
    match crate::core::exec::run("/usr/bin/killall", &["-HUP", "mDNSResponder"], opts) {
        Ok(_) => Ok("DNS cache flushed and mDNSResponder reset.".into()),
        Err(_) => Ok(
            "DNS cache flushed (resetting mDNSResponder needs admin privileges — skipped).".into(),
        ),
    }
}

#[cfg(test)]
mod golden_contract {
    use super::*;
    use crate::services::backups::{BackupConfig, BackupRecord};
    use crate::services::chaos::{ChaosProfile, ChaosProxyInfo};
    use crate::services::cloud::{AwsCostItem, AwsCostReport, Ec2Instance, S3Bucket};

    /// One sample Rust->JSON value per DTO behind `ipc()` for network, chaos,
    /// cloud and backups — screens that had no golden contract (AUDIT-2026-10-24
    /// ARC-01 / TST-01). Their zod schemas were tested against hand-written
    /// snake_case samples instead of real `#[serde(rename_all = "camelCase")]`
    /// output, so the camelCase drift (BUG-02…06) went undetected. This test
    /// writes the real serialized shape; the matching vitest test in
    /// `contracts.test.ts` parses it with each zod schema and asserts equality
    /// (zod drops unknown keys, so equality also catches a field only Rust sends).
    #[test]
    fn misc_contracts_golden() {
        let process = ProcessBandwidth {
            process: "com.apple.WebKit.Networking".into(),
            pid: 1234,
            bytes_in: 5_242_880,
            bytes_out: 1_048_576,
        };
        let network_info = NetworkInfo {
            primary_interface: "en0".into(),
            ipv4_address: Some("192.168.1.100".into()),
            ipv6_address: None,
            dns_servers: vec!["1.1.1.1".into(), "8.8.8.8".into()],
        };
        let chaos_profile = ChaosProfile {
            latency_ms: 150,
            drop_rate_pct: 10,
            reject: false,
        };
        let chaos_proxy = ChaosProxyInfo {
            id: "chaos-1".into(),
            target_port: 5432,
            chaos_port: 15432,
            profile: chaos_profile.clone(),
            active: true,
        };
        let ec2_instance = Ec2Instance {
            id: "i-1234567890abcdef0".into(),
            name: "api-prod-01".into(),
            state: "running".into(),
            instance_type: "t3.large".into(),
            public_ip: Some("54.210.10.1".into()),
            private_ip: Some("10.0.1.5".into()),
            region: "us-east-1".into(),
            is_prod: true,
            tags: vec![("Environment".into(), "production".into())],
        };
        let s3_bucket = S3Bucket {
            name: "stackroost-backups-vault".into(),
            creation_date: "2026-01-15T10:00:00Z".into(),
            region: Some("us-east-1".into()),
        };
        let cost_report = AwsCostReport {
            month_to_date_total: 142.5,
            currency: "USD".into(),
            top_services: vec![AwsCostItem {
                service: "Amazon Elastic Compute Cloud - Compute".into(),
                amount: 98.2,
                unit: "USD".into(),
            }],
            cached_at: 1_773_900_000,
        };
        let backup_record = BackupRecord {
            id: "bk-123456".into(),
            source_type: "postgres_remote".into(),
            source_name: "prod_api_db".into(),
            target_file:
                "/Users/test/Library/Application Support/Stackroost/backups/prod_api_db.sql.gz"
                    .into(),
            size_bytes: 41_943_040,
            created_at: 1_773_900_000,
            status: "success".into(),
        };
        let backup_config = BackupConfig {
            source: "remote".into(),
            host_alias: Some("prod-bastion".into()),
            engine: "postgres".into(),
            database: "users_service".into(),
            destination_dir: None,
        };

        let json = serde_json::to_string_pretty(&serde_json::json!({
            "processBandwidth": process,
            "networkInfo": network_info,
            "chaosProfile": chaos_profile,
            "chaosProxyInfo": chaos_proxy,
            "ec2Instance": ec2_instance,
            "s3Bucket": s3_bucket,
            "awsCostReport": cost_report,
            "backupRecord": backup_record,
            "backupConfig": backup_config,
        }))
        .unwrap()
            + "\n";

        let path = format!(
            "{}/../fixtures/contracts/misc-contracts.json",
            env!("CARGO_MANIFEST_DIR")
        );
        if std::env::var_os("UPDATE_GOLDEN").is_some() {
            std::fs::write(&path, &json).unwrap();
        }
        let golden = std::fs::read_to_string(&path).unwrap_or_default();
        assert_eq!(
            json, golden,
            "misc contracts changed; rerun with UPDATE_GOLDEN=1"
        );
    }
}
