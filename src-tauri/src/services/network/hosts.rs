use crate::core::exec::{self, ExecOpts};
use crate::core::validate::{HostName, IpAddr};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::os::unix::fs::OpenOptionsExt;
use std::path::Path;
use std::time::Duration;

pub const MANAGED_BEGIN: &str = "# --- BEGIN STACKROOST MANAGED ENTRIES ---";
pub const MANAGED_END: &str = "# --- END STACKROOST MANAGED ENTRIES ---";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HostEntry {
    pub id: String,
    pub ip: String,
    pub hostnames: Vec<String>,
    pub comment: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostsDoc {
    pub preamble: Vec<String>,
    pub entries: Vec<HostEntry>,
    pub postamble: Vec<String>,
}

fn is_system_entry(ip: &str, hostnames: &[&str]) -> bool {
    let is_sys_ip =
        ip == "127.0.0.1" || ip == "255.255.255.255" || ip == "::1" || ip.starts_with("fe80:");
    if !is_sys_ip {
        return false;
    }
    hostnames.iter().all(|h| {
        *h == "localhost" || *h == "broadcasthost" || *h == "ip6-localhost" || *h == "ip6-loopback"
    })
}

pub fn parse_hosts_content(content: &str) -> HostsDoc {
    let lines: Vec<&str> = content.lines().collect();

    // Check if managed block exists
    let begin_idx = lines.iter().position(|l| l.trim() == MANAGED_BEGIN);
    let end_idx = lines.iter().position(|l| l.trim() == MANAGED_END);

    if let (Some(b), Some(e)) = (begin_idx, end_idx) {
        if b < e {
            let preamble = lines[..b].iter().map(|s| s.to_string()).collect();
            let postamble = lines[e + 1..].iter().map(|s| s.to_string()).collect();

            let mut entries = Vec::new();
            for (idx, line) in lines[b + 1..e].iter().enumerate() {
                if let Some(entry) = parse_line_entry(line, &format!("host_{idx}")) {
                    entries.push(entry);
                }
            }

            return HostsDoc {
                preamble,
                entries,
                postamble,
            };
        }
    }

    // No managed block: separate system/comment lines from any custom entries
    let mut preamble = Vec::new();
    let mut entries = Vec::new();

    for (idx, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            preamble.push((*line).to_string());
            continue;
        }

        let (uncommented, _is_comment) = (trimmed, false);
        let comment_split: Vec<&str> = uncommented.splitn(2, '#').collect();
        let host_part = comment_split[0].trim();
        let parts: Vec<&str> = host_part.split_whitespace().collect();

        if parts.len() >= 2 {
            let ip = parts[0];
            let hostnames = &parts[1..];
            if is_system_entry(ip, hostnames) {
                preamble.push((*line).to_string());
            } else if let Some(entry) = parse_line_entry(line, &format!("host_{idx}")) {
                entries.push(entry);
            } else {
                preamble.push((*line).to_string());
            }
        } else {
            preamble.push((*line).to_string());
        }
    }

    HostsDoc {
        preamble,
        entries,
        postamble: Vec::new(),
    }
}

fn parse_line_entry(line: &str, id: &str) -> Option<HostEntry> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }

    let enabled = !trimmed.starts_with('#');
    let content = if enabled {
        trimmed
    } else {
        trimmed.trim_start_matches('#').trim()
    };

    let comment_split: Vec<&str> = content.splitn(2, '#').collect();
    let host_part = comment_split[0].trim();
    let comment = if comment_split.len() > 1 {
        let c = comment_split[1].trim();
        if c.is_empty() {
            None
        } else {
            Some(c.to_string())
        }
    } else {
        None
    };

    let parts: Vec<&str> = host_part.split_whitespace().collect();
    if parts.len() < 2 {
        return None;
    }

    let ip = parts[0].to_string();
    let hostnames = parts[1..].iter().map(|s| s.to_string()).collect();

    Some(HostEntry {
        id: id.to_string(),
        ip,
        hostnames,
        comment,
        enabled,
    })
}

pub fn render_hosts_doc(doc: &HostsDoc) -> String {
    let mut out = String::new();

    for line in &doc.preamble {
        out.push_str(line);
        out.push('\n');
    }

    out.push_str(MANAGED_BEGIN);
    out.push('\n');

    for e in &doc.entries {
        if !e.enabled {
            out.push_str("# ");
        }
        out.push_str(&e.ip);
        out.push('\t');
        out.push_str(&e.hostnames.join(" "));
        if let Some(ref c) = e.comment {
            out.push_str("\t# ");
            out.push_str(c);
        }
        out.push('\n');
    }

    out.push_str(MANAGED_END);
    out.push('\n');

    for line in &doc.postamble {
        out.push_str(line);
        out.push('\n');
    }

    out
}

pub fn validate_entries(entries: &[HostEntry]) -> AppResult<()> {
    for e in entries {
        // Validate IP
        let _ = IpAddr::try_from(e.ip.trim())?;

        // Hostnames must not be empty
        if e.hostnames.is_empty() {
            return Err(AppError::InvalidName(
                "each host entry must have at least one hostname".into(),
            ));
        }

        // Validate each hostname
        for h in &e.hostnames {
            let _ = HostName::try_from(h.trim())?;
        }

        // Validate comment: no newlines, no nulls
        if let Some(ref c) = e.comment {
            if c.contains('\n') || c.contains('\r') || c.contains('\0') {
                return Err(AppError::InvalidName(
                    "comment contains invalid control or newline characters".into(),
                ));
            }
        }
    }
    Ok(())
}

pub fn read_hosts_file() -> AppResult<Vec<HostEntry>> {
    let content = std::fs::read_to_string("/etc/hosts")
        .map_err(|e| AppError::Io(format!("read /etc/hosts: {e}")))?;
    let doc = parse_hosts_content(&content);
    Ok(doc.entries)
}

pub fn save_hosts_file(dir: &Path, entries: &[HostEntry]) -> AppResult<()> {
    validate_entries(entries)?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // Read current /etc/hosts
    let current = std::fs::read_to_string("/etc/hosts")
        .map_err(|e| AppError::Io(format!("read /etc/hosts: {e}")))?;

    // Backup current /etc/hosts
    let backup_dir = dir.join("hosts-backups");
    std::fs::create_dir_all(&backup_dir)
        .map_err(|e| AppError::Io(format!("create hosts backup dir: {e}")))?;
    let backup_path = backup_dir.join(format!("hosts-{now}.bak"));
    std::fs::write(&backup_path, &current)
        .map_err(|e| AppError::Io(format!("write hosts backup: {e}")))?;

    // Parse doc and apply new entries
    let mut doc = parse_hosts_content(&current);
    doc.entries = entries.to_vec();

    let rendered = render_hosts_doc(&doc);

    // Write temp staging file with 0644 mode
    let temp_path = dir.join("hosts.new");
    {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o644)
            .open(&temp_path)
            .map_err(|e| AppError::Io(format!("create temp staging hosts file: {e}")))?;
        file.write_all(rendered.as_bytes())
            .map_err(|e| AppError::Io(format!("write temp staging hosts: {e}")))?;
        file.sync_all()
            .map_err(|e| AppError::Io(format!("sync temp staging hosts: {e}")))?;
    }

    let temp_str = temp_path
        .to_str()
        .ok_or_else(|| AppError::InvalidName("temp path is not valid utf-8".into()))?;

    // Copy to /etc/hosts via osascript with fixed script and argv
    let script = "on run argv\nset src to item 1 of argv\ndo shell script \"cp \" & quoted form of src & \" /etc/hosts\" with administrator privileges\nend run";
    let opts = ExecOpts::default().with_timeout(Duration::from_secs(60));
    exec::run("/usr/bin/osascript", &["-e", script, "--", temp_str], opts)?;

    // Re-read and verify /etc/hosts
    let re_read = std::fs::read_to_string("/etc/hosts")
        .map_err(|e| AppError::Io(format!("verify read /etc/hosts: {e}")))?;
    if re_read != rendered {
        return Err(AppError::Io(
            "verification failed: /etc/hosts content does not match rendered staging file".into(),
        ));
    }

    Ok(())
}

pub fn restore_previous_hosts(dir: &Path) -> AppResult<()> {
    let backup_dir = dir.join("hosts-backups");
    if !backup_dir.exists() {
        return Err(AppError::NotFound("no previous hosts backup found".into()));
    }

    let mut backups = Vec::new();
    for entry in
        std::fs::read_dir(&backup_dir).map_err(|e| AppError::Io(format!("read backup dir: {e}")))?
    {
        let entry = entry.map_err(|e| AppError::Io(format!("read backup entry: {e}")))?;
        let p = entry.path();
        if p.is_file() && p.extension().map(|e| e == "bak").unwrap_or(false) {
            backups.push(p);
        }
    }

    backups.sort();
    let latest_backup = backups
        .pop()
        .ok_or_else(|| AppError::NotFound("no previous hosts backup found".into()))?;

    let content = std::fs::read_to_string(&latest_backup)
        .map_err(|e| AppError::Io(format!("read backup {}: {e}", latest_backup.display())))?;

    // Write temp staging file with 0644 mode
    let temp_path = dir.join("hosts.new");
    {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o644)
            .open(&temp_path)
            .map_err(|e| AppError::Io(format!("create temp staging hosts file: {e}")))?;
        file.write_all(content.as_bytes())
            .map_err(|e| AppError::Io(format!("write temp staging hosts: {e}")))?;
        file.sync_all()
            .map_err(|e| AppError::Io(format!("sync temp staging hosts: {e}")))?;
    }

    let temp_str = temp_path
        .to_str()
        .ok_or_else(|| AppError::InvalidName("temp path is not valid utf-8".into()))?;

    let script = "on run argv\nset src to item 1 of argv\ndo shell script \"cp \" & quoted form of src & \" /etc/hosts\" with administrator privileges\nend run";
    let opts = ExecOpts::default().with_timeout(Duration::from_secs(60));
    exec::run("/usr/bin/osascript", &["-e", script, "--", temp_str], opts)?;

    // Verify
    let re_read = std::fs::read_to_string("/etc/hosts")
        .map_err(|e| AppError::Io(format!("verify restore /etc/hosts: {e}")))?;
    if re_read != content {
        return Err(AppError::Io(
            "verification failed: restored /etc/hosts does not match backup".into(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE_HOSTS: &str = r#"##
# Host Database
#
# localhost is used to configure the loopback interface
# when the system is booting.  Do not change this entry.
##
127.0.0.1	localhost
255.255.255.255	broadcasthost
::1             localhost
# Custom dev hosts
127.0.0.1	api.local	# dev backend
"#;

    #[test]
    fn test_round_trip_fixture() {
        let doc = parse_hosts_content(FIXTURE_HOSTS);
        // Comments and system entries must be in preamble
        assert!(doc.preamble.iter().any(|l| l.contains("Host Database")));
        assert!(doc.preamble.iter().any(|l| l.contains("broadcasthost")));
        assert!(doc.preamble.iter().any(|l| l.contains("::1")));

        // Managed entries extracted
        assert_eq!(doc.entries.len(), 1);
        assert_eq!(doc.entries[0].ip, "127.0.0.1");
        assert_eq!(doc.entries[0].hostnames, vec!["api.local"]);
        assert_eq!(doc.entries[0].comment, Some("dev backend".to_string()));

        let rendered = render_hosts_doc(&doc);
        assert!(rendered.contains("broadcasthost"));
        assert!(rendered.contains("::1"));
        assert!(rendered.contains(MANAGED_BEGIN));
        assert!(rendered.contains("api.local"));
        assert!(rendered.contains("# dev backend"));
        assert!(rendered.contains(MANAGED_END));

        // Re-parsing rendered doc retains exact structure
        let round_trip_doc = parse_hosts_content(&rendered);
        assert_eq!(round_trip_doc.entries.len(), 1);
        assert_eq!(round_trip_doc.entries[0].hostnames, vec!["api.local"]);
        assert_eq!(
            round_trip_doc.entries[0].comment,
            Some("dev backend".to_string())
        );
    }

    #[test]
    fn test_validate_rejects_payloads() {
        let bad_ip_entry = HostEntry {
            id: "1".into(),
            ip: "127.0.0.1; rm -rf /".into(),
            hostnames: vec!["evil.local".into()],
            comment: None,
            enabled: true,
        };
        assert!(validate_entries(&[bad_ip_entry]).is_err());

        let bad_hostname_entry = HostEntry {
            id: "2".into(),
            ip: "127.0.0.1".into(),
            hostnames: vec!["evil.local`id`".into()],
            comment: None,
            enabled: true,
        };
        assert!(validate_entries(&[bad_hostname_entry]).is_err());

        let empty_hostnames_entry = HostEntry {
            id: "3".into(),
            ip: "127.0.0.1".into(),
            hostnames: vec![],
            comment: None,
            enabled: true,
        };
        assert!(validate_entries(&[empty_hostnames_entry]).is_err());

        let bad_comment_entry = HostEntry {
            id: "4".into(),
            ip: "127.0.0.1".into(),
            hostnames: vec!["safe.local".into()],
            comment: Some("bad\nnewline".into()),
            enabled: true,
        };
        assert!(validate_entries(&[bad_comment_entry]).is_err());

        let valid_entry = HostEntry {
            id: "5".into(),
            ip: "192.168.1.50".into(),
            hostnames: vec!["staging.server.internal".into()],
            comment: Some("staging internal".into()),
            enabled: true,
        };
        assert!(validate_entries(&[valid_entry]).is_ok());
    }
}
