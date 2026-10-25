// Disk totals (`df`), the APFS volume split (`diskutil apfs list`) and the
// pending-update signal (`tmutil listlocalsnapshots /`). Parsers are pure and
// tested on real captures in fixtures/maclean/.

use serde::Serialize;
use std::process::Command;

pub const DATA_VOLUME: &str = "/System/Volumes/Data";
const GB: u64 = 1024 * 1024 * 1024;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskStats {
    pub total_bytes: u64,
    /// Everything not available, across all volumes in the container.
    pub used_bytes: u64,
    pub free_bytes: u64,
    /// Used by the Data volume alone (apps, users, files).
    pub data_used_bytes: u64,
}

/// `df -k /System/Volumes/Data`: `Filesystem 1024-blocks Used Available …`.
/// APFS volumes share one container, so used = total − available (not the
/// Data volume's own "Used", which leaves out System, Preboot, VM…).
pub fn parse_df(out: &str) -> Option<DiskStats> {
    let cols: Vec<&str> = out.lines().nth(1)?.split_whitespace().collect();
    let kb = |i: usize| cols.get(i)?.parse::<u64>().ok().map(|v| v * 1024);
    let (total, data_used, avail) = (kb(1)?, kb(2)?, kb(3)?);
    Some(DiskStats {
        total_bytes: total,
        used_bytes: total.saturating_sub(avail),
        free_bytes: avail,
        data_used_bytes: data_used,
    })
}

pub fn disk_stats() -> Option<DiskStats> {
    let out = Command::new("df").args(["-k", DATA_VOLUME]).output().ok()?;
    parse_df(&String::from_utf8_lossy(&out.stdout))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Volume {
    /// APFS role: System, Data, Preboot, Recovery, VM, Update, or "" for none.
    pub role: String,
    pub label: String,
    pub why: String,
    pub bytes: u64,
    /// Bigger than this role normally gets (the script's thresholds).
    pub oversized: bool,
}

/// Label, explanation and "normal" ceiling per role (the script's table).
fn role_meta(role: &str, name: &str) -> (String, &'static str, u64) {
    match role {
        "System" => (
            "macOS system".into(),
            "Sealed, read-only macOS. Normal.",
            20 * GB,
        ),
        "Data" => (
            "Data (all your stuff)".into(),
            "Apps, users and files: broken down above.",
            u64::MAX,
        ),
        "Preboot" => (
            "Preboot".into(),
            "Boot files and staged macOS updates.",
            10 * GB,
        ),
        "Recovery" => ("Recovery".into(), "The recovery system. Normal.", 5 * GB),
        "VM" => (
            "VM (swap)".into(),
            "Swap memory. Shrinks after a restart.",
            8 * GB,
        ),
        "Update" => ("Update".into(), "macOS update staging area.", GB),
        _ => (
            if name.is_empty() {
                "Other volume".into()
            } else {
                name.to_string()
            },
            "Another APFS volume in this container.",
            u64::MAX,
        ),
    }
}

/// Text form of `diskutil apfs list` (the plist form needs a plist parser we
/// don't otherwise ship; this mirrors the script's proven awk). Tiny firmware
/// volumes (< 50 MB) are left out, except System and Data.
pub fn parse_apfs_list(out: &str) -> Vec<Volume> {
    let mut vols = Vec::new();
    let (mut role, mut name) = (String::new(), String::new());
    for line in out.lines() {
        let l = line.trim_start_matches(|c: char| c == '|' || c.is_whitespace());
        if let Some(rest) = l.strip_prefix("APFS Volume Disk (Role):") {
            role = rest
                .rsplit_once('(')
                .map(|(_, r)| r.trim_end_matches(')').trim().to_string())
                .unwrap_or_default();
            if role == "No specific role" {
                role.clear();
            }
            name.clear();
        } else if let Some(rest) = l.strip_prefix("Name:") {
            name = rest.trim().split(" (").next().unwrap_or("").to_string();
        } else if let Some(rest) = l.strip_prefix("Capacity Consumed:") {
            let Some(bytes) = rest
                .split_whitespace()
                .next()
                .and_then(|b| b.parse::<u64>().ok())
            else {
                continue;
            };
            if bytes < 50 * 1024 * 1024 && role != "System" && role != "Data" {
                continue;
            }
            let (label, why, limit) = role_meta(&role, &name);
            vols.push(Volume {
                role: role.clone(),
                label,
                why: why.into(),
                bytes,
                oversized: bytes > limit,
            });
        }
    }
    vols
}

pub fn apfs_volumes() -> Vec<Volume> {
    Command::new("diskutil")
        .args(["apfs", "list"])
        .output()
        .map(|o| parse_apfs_list(&String::from_utf8_lossy(&o.stdout)))
        .unwrap_or_default()
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LocalSnapshots {
    /// A macOS update is downloaded but not installed.
    pub pending_update: bool,
    pub time_machine: usize,
}

pub fn parse_local_snapshots(out: &str) -> LocalSnapshots {
    LocalSnapshots {
        pending_update: out.contains("MSUPrepareUpdate"),
        time_machine: out
            .lines()
            .filter(|l| l.contains("com.apple.TimeMachine."))
            .count(),
    }
}

pub fn local_snapshots() -> LocalSnapshots {
    Command::new("tmutil")
        .args(["listlocalsnapshots", "/"])
        .output()
        .map(|o| parse_local_snapshots(&String::from_utf8_lossy(&o.stdout)))
        .unwrap_or_default()
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotInfo {
    pub name: String,
    pub date: String,
    pub kind: String, // "time_machine" | "system_update" | "third_party"
    pub is_deletable: bool,
    pub purgeable: bool,
    pub xid: Option<String>,
}

pub fn parse_apfs_snapshots(out: &str) -> Vec<SnapshotInfo> {
    let mut snapshots = Vec::new();
    let mut current_name = String::new();
    let mut current_xid: Option<String> = None;
    let mut current_purgeable = false;

    let flush = |snapshots: &mut Vec<SnapshotInfo>,
                 name: &mut String,
                 xid: &mut Option<String>,
                 purgeable: &mut bool| {
        if !name.is_empty() {
            let n = name.clone();
            let is_tm = n.contains("com.apple.TimeMachine.");
            let is_up = n.contains("update") || n.contains("MSUPrepareUpdate");
            let kind = if is_tm {
                "time_machine".to_string()
            } else if is_up {
                "system_update".to_string()
            } else {
                "third_party".to_string()
            };
            let is_deletable = is_tm;
            let date = if is_tm {
                n.strip_prefix("com.apple.TimeMachine.")
                    .and_then(|s| s.strip_suffix(".local").or(Some(s)))
                    .unwrap_or(&n)
                    .to_string()
            } else {
                String::new()
            };
            snapshots.push(SnapshotInfo {
                name: n,
                date,
                kind,
                is_deletable,
                purgeable: *purgeable,
                xid: xid.take(),
            });
            name.clear();
            *purgeable = false;
        }
    };

    for line in out.lines() {
        let trimmed = line
            .trim_start_matches(|c: char| c == '|' || c == '+' || c == '-' || c.is_whitespace());
        if let Some(rest) = trimmed.strip_prefix("Name:") {
            flush(
                &mut snapshots,
                &mut current_name,
                &mut current_xid,
                &mut current_purgeable,
            );
            current_name = rest.trim().to_string();
        } else if let Some(rest) = trimmed.strip_prefix("XID:") {
            current_xid = Some(rest.trim().to_string());
        } else if let Some(rest) = trimmed.strip_prefix("Purgeable:") {
            current_purgeable = rest.trim().eq_ignore_ascii_case("yes");
        } else if trimmed.starts_with("com.apple.") {
            flush(
                &mut snapshots,
                &mut current_name,
                &mut current_xid,
                &mut current_purgeable,
            );
            current_name = trimmed.to_string();
        }
    }
    flush(
        &mut snapshots,
        &mut current_name,
        &mut current_xid,
        &mut current_purgeable,
    );

    snapshots
}

pub fn list_apfs_snapshots() -> Vec<SnapshotInfo> {
    if let Ok(o) = Command::new("diskutil")
        .args(["apfs", "listSnapshots", DATA_VOLUME])
        .output()
    {
        let stdout = String::from_utf8_lossy(&o.stdout);
        let parsed = parse_apfs_snapshots(&stdout);
        if !parsed.is_empty() {
            return parsed;
        }
    }
    if let Ok(o) = Command::new("tmutil")
        .args(["listlocalsnapshots", "/"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&o.stdout);
        return parse_apfs_snapshots(&stdout);
    }
    Vec::new()
}

pub fn query_purgeable_bytes() -> u64 {
    if let Ok(out) = Command::new("/usr/bin/swift")
        .args([
            "-e",
            r#"import Foundation
let u = URL(fileURLWithPath: "/System/Volumes/Data")
if let v = try? u.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey, .volumeAvailableCapacityKey]) {
    let a = Int64(v.volumeAvailableCapacity ?? 0)
    let i = v.volumeAvailableCapacityForImportantUsage ?? 0
    print(max(Int64(0), i - a))
}"#,
        ])
        .output()
    {
        if out.status.success() {
            if let Ok(s) = std::str::from_utf8(&out.stdout) {
                if let Ok(b) = s.trim().parse::<u64>() {
                    return b;
                }
            }
        }
    }
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> String {
        std::fs::read_to_string(format!(
            "{}/../fixtures/maclean/{name}",
            env!("CARGO_MANIFEST_DIR")
        ))
        .unwrap()
    }

    #[test]
    fn df_uses_container_available_space() {
        let d = parse_df(&fixture("df.txt")).unwrap();
        assert_eq!(d.total_bytes, 239_362_496 * 1024);
        assert_eq!(d.free_bytes, 20_178_820 * 1024);
        assert_eq!(d.used_bytes, (239_362_496 - 20_178_820) * 1024);
        assert_eq!(d.data_used_bytes, 179_573_964 * 1024);
        assert!(parse_df("junk").is_none());
    }

    #[test]
    fn apfs_roles_sizes_and_thresholds() {
        let v = parse_apfs_list(&fixture("diskutil-apfs-list.txt"));
        let by = |role: &str| v.iter().find(|x| x.role == role).unwrap();
        assert_eq!(by("Preboot").bytes, 18_366_169_088);
        assert!(by("Preboot").oversized, "18.4 GB is over the 10 GB norm");
        assert!(!by("VM").oversized);
        assert!(!by("Recovery").oversized);
        assert_eq!(by("Data").label, "Data (all your stuff)");
        assert_eq!(by("System").bytes, 13_657_120_768);
        // The role-less "Macintosh HD" volume keeps its own name.
        assert!(v
            .iter()
            .any(|x| x.role.is_empty() && x.label == "Macintosh HD"));
        assert!(parse_apfs_list("nothing here").is_empty());
    }

    #[test]
    fn snapshot_signals() {
        assert_eq!(
            parse_local_snapshots(&fixture("tmutil-snapshots.txt")),
            LocalSnapshots::default()
        );
        // tmutil's line format for the two kinds of local snapshot.
        let s = parse_local_snapshots(
            "Snapshots for disk /:\ncom.apple.TimeMachine.2026-10-19-101010.local\n\
             com.apple.TimeMachine.2026-10-19-111010.local\ncom.apple.os.update-MSUPrepareUpdate\n",
        );
        assert!(s.pending_update);
        assert_eq!(s.time_machine, 2);
    }

    #[test]
    fn parse_apfs_snapshots_formats() {
        let text = r#"Snapshots for disk3s7 (2 found)
|
+-- Name:        com.apple.TimeMachine.2026-10-24-220511.local
|   XID:         12345
|   Purgeable:   Yes
|   NOTE:        This snapshot is purgeable
|
+-- Name:        com.apple.os.update-MSUPrepareUpdate
    XID:         12346
    Purgeable:   No
"#;
        let list = parse_apfs_snapshots(text);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].kind, "time_machine");
        assert!(list[0].is_deletable);
        assert!(list[0].purgeable);
        assert_eq!(list[0].date, "2026-10-24-220511");
        assert_eq!(list[0].xid.as_deref(), Some("12345"));

        assert_eq!(list[1].kind, "system_update");
        assert!(!list[1].is_deletable);
        assert!(!list[1].purgeable);
        assert_eq!(list[1].xid.as_deref(), Some("12346"));
    }
}
