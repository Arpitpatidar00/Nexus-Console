use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostEntry {
    pub id: String,
    pub ip: String,
    pub hostnames: Vec<String>,
    pub comment: Option<String>,
    pub enabled: bool,
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
    Ok(list)
}

pub fn flush_dns_cache() -> AppResult<String> {
    let _ = Command::new("/usr/bin/dscacheutil")
        .arg("-flushcache")
        .output();
    let _ = Command::new("/usr/bin/killall")
        .args(["-HUP", "mDNSResponder"])
        .output();
    Ok("DNS cache flushed successfully".into())
}

pub fn read_hosts_file() -> AppResult<Vec<HostEntry>> {
    let content = std::fs::read_to_string("/etc/hosts")
        .map_err(|e| AppError::Io(format!("read /etc/hosts: {e}")))?;

    let mut entries = Vec::new();

    for (idx, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let is_comment = trimmed.starts_with('#');
        let unhashed = if is_comment {
            trimmed.trim_start_matches('#').trim()
        } else {
            trimmed
        };

        let parts: Vec<&str> = unhashed.split_whitespace().collect();
        if parts.len() >= 2 && (parts[0].contains('.') || parts[0].contains(':')) {
            let ip = parts[0].to_string();
            let hostnames: Vec<String> = parts[1..].iter().map(|s| s.to_string()).collect();
            entries.push(HostEntry {
                id: format!("host_{idx}"),
                ip,
                hostnames,
                comment: None,
                enabled: !is_comment,
            });
        }
    }

    Ok(entries)
}

pub fn save_hosts_file(dir: &Path, entries: &[HostEntry]) -> AppResult<()> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // Create backup in AppData
    let backup_dir = dir.join("hosts-backups");
    std::fs::create_dir_all(&backup_dir)
        .map_err(|e| AppError::Io(format!("create hosts backup dir: {e}")))?;
    if let Ok(current) = std::fs::read_to_string("/etc/hosts") {
        let _ = std::fs::write(backup_dir.join(format!("hosts-{now}.bak")), current);
    }

    let mut output = String::from("##\n# Host Database managed by Stackroost\n##\n");
    for e in entries {
        if !e.enabled {
            output.push_str("# ");
        }
        output.push_str(&format!(
            "{}	{}
",
            e.ip,
            e.hostnames.join(" ")
        ));
    }

    let temp_path = dir.join("hosts.new");
    std::fs::write(&temp_path, output)
        .map_err(|e| AppError::Io(format!("write staging hosts: {e}")))?;

    let cmd = format!(
        r#"cp "{0}" /etc/hosts 2>/dev/null || osascript -e 'do shell script "cp "{0}" /etc/hosts" with administrator privileges'"#,
        temp_path.display()
    );
    let _ = Command::new("sh").arg("-c").arg(&cmd).output();

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_read_hosts_file() {
        let entries = read_hosts_file().unwrap();
        assert!(!entries.is_empty());
        assert!(entries.iter().any(|e| e.ip == "127.0.0.1"));
    }
}
