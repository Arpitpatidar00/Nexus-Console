// Deep scan (docs/maclean/PLAN.md §3.7): the script's `--deep`, through the
// native macOS admin prompt. ONE constant, read-only script runs as root:
// `du` over fixed system paths and the user homes. Nothing from the frontend
// or the filesystem is ever spliced into it; nothing deletes as root.

use super::disk::SnapshotInfo;
use super::scan::{Cause, MapEntry};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::process::Command;

const GIB: u64 = 1024 * 1024 * 1024;

/// Granular, read-only scanner script covering all major footprints on Data volume.
///
/// A root shell started from the admin prompt does NOT inherit Stackroost's
/// Full Disk Access (TCC attributes it to the authorization trampoline), so
/// `du` here silently skips Mail, Messages, Group Containers… The console
/// user's home is therefore skipped and measured in-process instead
/// (`measure_home`), where the app's FDA applies.
pub const DEEP_SCRIPT: &str = r#"me=$(stat -f %Su /dev/console 2>/dev/null)
for u in /Users/*; do
  [ -d "$u" ] || continue
  n="${u##*/}"
  case "$n" in Guest|.localized|Shared) continue ;; esac
  [ "$n" = "$me" ] && continue
  ukb=$(du -skx "$u" 2>/dev/null | cut -f1)
  [ -n "$ukb" ] && printf 'user_total\t%s\t%s\t%s\n' "$n" "$u" "$ukb"
  for item in "$u"/* "$u"/.*; do
    [ -e "$item" ] || continue
    bn="${item##*/}"
    case "$bn" in .|..) continue ;; esac
    case "$bn" in
      Library)
        for lsub in "$item"/*; do
          [ -e "$lsub" ] || continue
          lsbn="${lsub##*/}"
          lkb=$(du -skx "$lsub" 2>/dev/null | cut -f1)
          [ -n "$lkb" ] && printf 'user_sub\t%s\t%s\t%s\n' "$n/Library/$lsbn" "$lsub" "$lkb"
        done
        ;;
      *)
        skb=$(du -skx "$item" 2>/dev/null | cut -f1)
        [ -n "$skb" ] && printf 'user_sub\t%s\t%s\t%s\n' "$n/$bn" "$item" "$skb"
        ;;
    esac
  done
  for tp in "$u/Library/Mail" "$u/Library/Messages" "$u/Library/Safari" "$u/Library/Application Support/MobileSync" "$u/Library/Containers"; do
    if [ -e "$tp" ]; then
      [ -r "$tp" ] || printf 'eperm\t%s\t%s\t0\n' "${tp##*/}" "$tp"
    fi
  done
done
if [ -d /Users/Shared ]; then
  skb=$(du -skx /Users/Shared 2>/dev/null | cut -f1)
  [ -n "$skb" ] && printf 'user_total\tShared\t/Users/Shared\t%s\n' "$skb"
  for sitem in /Users/Shared/*; do
    if [ -e "$sitem" ]; then
      sskb=$(du -skx "$sitem" 2>/dev/null | cut -f1)
      [ -n "$sskb" ] && printf 'user_sub\tShared/%s\t%s\t%s\n' "${sitem##*/}" "$sitem" "$sskb"
    fi
  done
fi
for app in /Applications/*; do
  if [ -e "$app" ]; then
    akb=$(du -skx "$app" 2>/dev/null | cut -f1)
    [ -n "$akb" ] && printf 'app\t%s\t%s\t%s\n' "${app##*/}" "$app" "$akb"
  fi
done
for dev in /opt/homebrew /usr/local /Library/Developer; do
  if [ -e "$dev" ]; then
    dkb=$(du -skx "$dev" 2>/dev/null | cut -f1)
    [ -n "$dkb" ] && printf 'dev_total\t%s\t%s\t%s\n' "${dev##*/}" "$dev" "$dkb"
    if [ "$dev" = "/opt/homebrew" ]; then
      for hsub in Cellar Caskroom var etc; do
        hp="$dev/$hsub"
        if [ -d "$hp" ]; then
          hkb=$(du -skx "$hp" 2>/dev/null | cut -f1)
          [ -n "$hkb" ] && printf 'dev_sub\t%s\t%s\t%s\n' "$hsub" "$hp" "$hkb"
        fi
      done
    fi
    if [ "$dev" = "/Library/Developer" ]; then
      for dsub in CoreSimulator CommandLineTools; do
        dp="$dev/$dsub"
        if [ -d "$dp" ]; then
          ddkb=$(du -skx "$dp" 2>/dev/null | cut -f1)
          [ -n "$ddkb" ] && printf 'dev_sub\t%s\t%s\t%s\n' "$dsub" "$dp" "$ddkb"
        fi
      done
    fi
  fi
done
for lp in /Library/*; do
  [ -e "$lp" ] || continue
  lsub="${lp##*/}"
  case "$lsub" in Developer) continue ;; esac
  lkb=$(du -skx "$lp" 2>/dev/null | cut -f1)
  [ -n "$lkb" ] && printf 'lib_sub\t%s\t%s\t%s\n' "$lsub" "$lp" "$lkb"
done
for pv in /private/*; do
  [ -e "$pv" ] || continue
  case "${pv##*/}" in var) continue ;; esac
  pkb=$(du -skx "$pv" 2>/dev/null | cut -f1)
  [ -n "$pkb" ] && printf 'sys_sub\t%s\t%s\t%s\n' "${pv##*/}" "$pv" "$pkb"
done
for sys in /private/var/*; do
  [ -e "$sys" ] || continue
  sbn="${sys##*/}"
  case "$sbn" in vm) continue ;; esac
  skb=$(du -skx "$sys" 2>/dev/null | cut -f1)
  [ -n "$skb" ] && printf 'sys_sub\t%s\t%s\t%s\n' "$sbn" "$sys" "$skb"
done
if [ -e /System/Volumes/Data/System ]; then
  skb=$(du -skx /System/Volumes/Data/System 2>/dev/null | cut -f1)
  [ -n "$skb" ] && printf 'sys_sub\tSystem\t/System/Volumes/Data/System\t%s\n' "$skb"
fi
for inst in '/System/Volumes/Data/macOS Install Data' /Library/Updates; do
  if [ -e "$inst" ]; then
    ikb=$(du -skx "$inst" 2>/dev/null | cut -f1)
    [ -n "$ikb" ] && printf 'inst_sub\t%s\t%s\t%s\n' "${inst##*/}" "$inst" "$ikb"
  fi
done
for vmp in /private/var/vm/*; do
  if [ -e "$vmp" ]; then
    vkb=$(du -skx "$vmp" 2>/dev/null | cut -f1)
    [ -n "$vkb" ] && printf 'vm_sub\t%s\t%s\t%s\n' "${vmp##*/}" "$vmp" "$vkb"
  fi
done
for sys_tp in "/private/var/root" "/System/Volumes/Data/.Spotlight-V100"; do
  if [ -e "$sys_tp" ]; then
    [ -r "$sys_tp" ] || printf 'eperm\t%s\t%s\t0\n' "${sys_tp##*/}" "$sys_tp"
  fi
done
for dp in /System/Volumes/Data/* /System/Volumes/Data/.*; do
  [ -e "$dp" ] || continue
  dbn="${dp##*/}"
  case "$dbn" in .|..|Applications|Library|Users|opt|private|usr|System|Volumes|dev|cores|home|net|.Spotlight-V100|macOS\ Install\ Data) continue ;; esac
  dkb=$(du -skx "$dp" 2>/dev/null | cut -f1)
  [ -n "$dkb" ] && printf 'data_root\t%s\t%s\t%s\n' "$dbn" "$dp" "$dkb"
done
for dp in /System/Volumes/Data/opt/* /System/Volumes/Data/usr/*; do
  [ -e "$dp" ] || continue
  case "$dp" in */opt/homebrew|*/usr/local) continue ;; esac
  dkb=$(du -skx "$dp" 2>/dev/null | cut -f1)
  [ -n "$dkb" ] && printf 'data_root\t%s\t%s\t%s\n' "${dp#/System/Volumes/Data/}" "$dp" "$dkb"
done"#;

/// AppleScript string literal for `do shell script "…"`.
pub fn applescript_quote(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawItem {
    pub tag: String,
    pub name: String,
    pub path: String,
    pub bytes: u64,
}

/// Parse lines into `RawItem`s. Handles both 4-column (`tag\tname\tpath\tKB`)
/// and 2-column (`label\tKB`) output formats.
pub fn parse_raw_items(out: &str) -> Vec<RawItem> {
    out.lines()
        .filter_map(|l| {
            let cols: Vec<&str> = l.split('\t').collect();
            if cols.len() >= 4 {
                let tag = cols[0].trim().to_string();
                let name = cols[1].trim().to_string();
                let path = cols[2].trim().to_string();
                let kb = cols[3].trim().parse::<u64>().ok()?;
                Some(RawItem {
                    tag,
                    name,
                    path,
                    bytes: kb * 1024,
                })
            } else if cols.len() == 2 {
                let label = cols[0].trim();
                let kb = cols[1].trim().parse::<u64>().ok()?;
                let (tag, name, path) = if let Some(user) = label.strip_prefix("u:") {
                    (
                        "user_total".to_string(),
                        user.to_string(),
                        format!("/Users/{user}"),
                    )
                } else if label.starts_with("/Applications") {
                    ("app".to_string(), label.to_string(), label.to_string())
                } else if label.starts_with("/opt/homebrew")
                    || label.starts_with("/usr/local")
                    || label.starts_with("/Library/Developer")
                {
                    (
                        "dev_total".to_string(),
                        label.to_string(),
                        label.to_string(),
                    )
                } else if label.starts_with("/Library") {
                    ("lib_sub".to_string(), label.to_string(), label.to_string())
                } else if label.contains("Install Data") || label.contains("Updates") {
                    ("inst_sub".to_string(), label.to_string(), label.to_string())
                } else if label.starts_with("/private/var/vm") {
                    ("vm_sub".to_string(), label.to_string(), label.to_string())
                } else {
                    ("sys_sub".to_string(), label.to_string(), label.to_string())
                };
                Some(RawItem {
                    tag,
                    name,
                    path,
                    bytes: kb * 1024,
                })
            } else {
                None
            }
        })
        .collect()
}

/// Legacy parser returning `(label, bytes)` for backwards compatibility.
pub fn parse_output(out: &str) -> Vec<(String, u64)> {
    parse_raw_items(out)
        .into_iter()
        .map(|item| {
            let label = if item.tag == "user_total" {
                format!("u:{}", item.name)
            } else {
                item.path
            };
            (label, item.bytes)
        })
        .collect()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepSubItem {
    pub name: String,
    pub path: String,
    pub bytes: u64,
    pub is_deletable: bool,
    pub kind: String, // "snapshot" | "update_snapshot" | "cache" | "app" | "folder" | "file" | "user" | "restricted"
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepCategory {
    pub id: String,
    pub title: String,
    pub subtitle: String,
    pub total_bytes: u64,
    pub percentage_of_volume: f64,
    pub severity: String, // "normal" | "warning" | "actionable"
    pub permission_blocked_count: usize,
    pub sub_items: Vec<DeepSubItem>,
    pub available_actions: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepEntry {
    pub label: String,
    pub why: String,
    pub bytes: u64,
    /// Bigger than it should be (the script's thresholds): warn + words.
    pub flagged: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepReport {
    pub categories: Vec<DeepCategory>,
    pub entries: Vec<DeepEntry>,
    pub causes: Vec<Cause>,
    pub total_data_used_bytes: u64,
    pub purgeable_bytes: u64,
    pub permission_denied_paths: Vec<String>,
    /// Stackroost itself holds Full Disk Access (`has_full_disk_access`).
    pub full_disk_access: bool,
}

/// Overhauled build report attributing every gigabyte accurately.
pub fn build_report(
    raw: &[RawItem],
    me: &str,
    _map: &[MapEntry],
    data_used: u64,
    snapshots: &[SnapshotInfo],
    purgeable_bytes: u64,
    full_disk_access: bool,
) -> DeepReport {
    let mut categories = Vec::new();
    let mut causes = Vec::new();

    // 1. APFS Snapshots & Purgeable
    let mut snapshot_sub_items = Vec::new();
    for s in snapshots {
        snapshot_sub_items.push(DeepSubItem {
            name: s.name.clone(),
            path: s.name.clone(),
            bytes: 0, // APFS snapshots share blocks; extents are tracked via purgeable
            is_deletable: s.is_deletable,
            kind: s.kind.clone(),
        });
    }
    if purgeable_bytes > 0 {
        snapshot_sub_items.push(DeepSubItem {
            name: "macOS Evictable/Purgeable Cache".into(),
            path: "/System/Volumes/Data".into(),
            bytes: purgeable_bytes,
            is_deletable: true,
            kind: "cache".into(),
        });
    }
    let snap_actionable = purgeable_bytes > 5 * GIB || snapshots.iter().any(|s| s.is_deletable);
    if purgeable_bytes > 5 * GIB {
        causes.push(Cause {
            bytes: Some(purgeable_bytes),
            text: "macOS purgeable cache and snapshots hold reclaimable space.".into(),
            fix: "macOS will automatically reclaim this when space is needed, or thin local snapshots.".into(),
        });
    }
    let mut snap_actions = Vec::new();
    if snapshots.iter().any(|s| s.is_deletable) {
        snap_actions.push("delete_snapshot".into());
        snap_actions.push("thin_snapshots".into());
    }
    if purgeable_bytes > 0 {
        snap_actions.push("purge_cache".into());
    }
    categories.push(DeepCategory {
        id: "snapshots_purgeable".into(),
        title: "Snapshots & purgeable".into(),
        subtitle: "APFS local snapshots & macOS evictable caches.".into(),
        total_bytes: purgeable_bytes,
        percentage_of_volume: if data_used > 0 {
            (purgeable_bytes as f64 * 100.0) / data_used as f64
        } else {
            0.0
        },
        severity: if snap_actionable {
            "actionable".into()
        } else {
            "normal".into()
        },
        permission_blocked_count: 0,
        sub_items: snapshot_sub_items,
        available_actions: snap_actions,
    });

    // 2. Developer & Toolchains (system + user-level dev toolchains)
    let dev_user_items: Vec<DeepSubItem> = raw
        .iter()
        .filter(|i| i.tag == "dev_user")
        .map(|i| DeepSubItem {
            name: format!("~/{}", i.name),
            path: i.path.clone(),
            bytes: i.bytes,
            is_deletable: i.name == ".cache",
            kind: "folder".into(),
        })
        .collect();
    let dev_user_total: u64 = dev_user_items.iter().map(|s| s.bytes).sum();

    let mut dev_sub_items: Vec<DeepSubItem> = raw
        .iter()
        .filter(|i| i.tag == "dev_sub")
        .map(|i| DeepSubItem {
            name: i.name.clone(),
            path: i.path.clone(),
            bytes: i.bytes,
            is_deletable: false,
            kind: "folder".into(),
        })
        .collect();
    // Include dev_total paths that have no sub-items
    for dt in raw.iter().filter(|i| i.tag == "dev_total") {
        if !dev_sub_items.iter().any(|s| s.path.starts_with(&dt.path)) {
            dev_sub_items.push(DeepSubItem {
                name: dt.name.clone(),
                path: dt.path.clone(),
                bytes: dt.bytes,
                is_deletable: false,
                kind: "folder".into(),
            });
        }
    }
    dev_sub_items.extend(dev_user_items);
    dev_sub_items.sort_by_key(|s| std::cmp::Reverse(s.bytes));

    let dev_system_total: u64 = raw
        .iter()
        .filter(|i| i.tag == "dev_total")
        .map(|i| i.bytes)
        .sum();
    let dev_total = dev_system_total + dev_user_total;

    categories.push(DeepCategory {
        id: "developer".into(),
        title: "Developer & package managers".into(),
        subtitle: "Homebrew installations, command-line toolchains, and user SDKs (~/.cargo, ~/.nvm, etc.).".into(),
        total_bytes: dev_total,
        percentage_of_volume: if data_used > 0 {
            (dev_total as f64 * 100.0) / data_used as f64
        } else {
            0.0
        },
        severity: if dev_total > 20 * GIB {
            "warning".into()
        } else {
            "normal".into()
        },
        permission_blocked_count: 0,
        sub_items: dev_sub_items,
        available_actions: vec!["reveal".into(), "clean".into()],
    });

    // 3. Current User (~/<me>)
    let my_user_total = raw
        .iter()
        .find(|i| i.tag == "user_total" && i.name == me)
        .map(|i| i.bytes)
        .unwrap_or(0);
    let mut my_sub_items: Vec<DeepSubItem> = raw
        .iter()
        .filter(|i| i.tag == "user_sub" && i.name.starts_with(&format!("{me}/")))
        .map(|i| {
            let rel = i.name.strip_prefix(&format!("{me}/")).unwrap_or(&i.name);
            DeepSubItem {
                name: rel.to_string(),
                path: i.path.clone(),
                bytes: i.bytes,
                is_deletable: rel == "Library/Caches",
                kind: "folder".into(),
            }
        })
        .collect();
    my_sub_items.sort_by_key(|s| std::cmp::Reverse(s.bytes));
    let measured_user_bytes = my_sub_items.iter().map(|s| s.bytes).sum::<u64>();
    // Subtract user dev tools from home total to avoid double counting with Developer category
    let user_home_net = my_user_total.saturating_sub(dev_user_total);
    let effective_user_total = user_home_net.max(measured_user_bytes);
    categories.push(DeepCategory {
        id: "current_user".into(),
        title: format!("Your account (~/{me})"),
        subtitle: "Application caches, containers, documents, and personal workspace.".into(),
        total_bytes: effective_user_total,
        percentage_of_volume: if data_used > 0 {
            (effective_user_total as f64 * 100.0) / data_used as f64
        } else {
            0.0
        },
        severity: "normal".into(),
        permission_blocked_count: 0,
        sub_items: my_sub_items,
        available_actions: vec!["reveal".into()],
    });

    // 4. Other Users & Shared
    let other_users: Vec<&RawItem> = raw
        .iter()
        .filter(|i| i.tag == "user_total" && i.name != me)
        .collect();
    let other_users_total = other_users.iter().map(|i| i.bytes).sum::<u64>();
    let mut other_sub_items = Vec::new();
    for u in &other_users {
        if u.bytes > 5 * GIB {
            causes.push(Cause {
                bytes: Some(u.bytes),
                text: format!("The {} account holds this much.", u.name),
                fix: "Delete it in System Settings → Users & Groups if unused, or log into it and clean there.".into(),
            });
        }
        other_sub_items.push(DeepSubItem {
            name: if u.name == "Shared" {
                "Shared (/Users/Shared)".into()
            } else {
                format!("User: {}", u.name)
            },
            path: u.path.clone(),
            bytes: u.bytes,
            is_deletable: false,
            kind: "user".into(),
        });
    }
    other_sub_items.sort_by_key(|s| std::cmp::Reverse(s.bytes));
    categories.push(DeepCategory {
        id: "other_users".into(),
        title: "Other accounts & Shared".into(),
        subtitle: "Files belonging to other user profiles and /Users/Shared.".into(),
        total_bytes: other_users_total,
        percentage_of_volume: if data_used > 0 {
            (other_users_total as f64 * 100.0) / data_used as f64
        } else {
            0.0
        },
        severity: if other_users_total > 10 * GIB {
            "warning".into()
        } else {
            "normal".into()
        },
        permission_blocked_count: 0,
        sub_items: other_sub_items,
        available_actions: vec!["users_and_groups".into(), "reveal".into()],
    });

    // 5. System Data & Databases
    let mut sys_sub_items: Vec<DeepSubItem> = raw
        .iter()
        .filter(|i| i.tag == "sys_sub")
        .map(|i| DeepSubItem {
            name: i.name.clone(),
            path: i.path.clone(),
            bytes: i.bytes,
            is_deletable: false,
            kind: "folder".into(),
        })
        .collect();
    sys_sub_items.sort_by_key(|s| std::cmp::Reverse(s.bytes));
    let sys_total: u64 = sys_sub_items.iter().map(|s| s.bytes).sum();
    let temp_bytes = raw
        .iter()
        .find(|i| i.tag == "sys_sub" && (i.name == "folders" || i.path.contains("var/folders")))
        .map(|i| i.bytes)
        .unwrap_or(0);
    if temp_bytes > 3 * GIB {
        causes.push(Cause {
            bytes: Some(temp_bytes),
            text: "Temporary & per-app caches (/private/var/folders) are large.".into(),
            fix: "Restart your Mac to safely flush system temporary files.".into(),
        });
    }
    categories.push(DeepCategory {
        id: "system_data".into(),
        title: "System databases & caches".into(),
        subtitle: "Spotlight database, diagnostic logs, and temporary caches.".into(),
        total_bytes: sys_total,
        percentage_of_volume: if data_used > 0 {
            (sys_total as f64 * 100.0) / data_used as f64
        } else {
            0.0
        },
        severity: if temp_bytes > 3 * GIB {
            "warning".into()
        } else {
            "normal".into()
        },
        permission_blocked_count: 0,
        sub_items: sys_sub_items,
        available_actions: vec!["reveal".into()],
    });

    // 6. Shared /Library & Applications
    let mut apps_sub_items: Vec<DeepSubItem> = raw
        .iter()
        .filter(|i| i.tag == "app" || i.tag == "lib_sub")
        .map(|i| DeepSubItem {
            name: i.name.clone(),
            path: i.path.clone(),
            bytes: i.bytes,
            is_deletable: false,
            kind: if i.tag == "app" {
                "app".into()
            } else {
                "folder".into()
            },
        })
        .collect();
    apps_sub_items.sort_by_key(|s| std::cmp::Reverse(s.bytes));
    let apps_lib_total: u64 = apps_sub_items.iter().map(|s| s.bytes).sum();
    categories.push(DeepCategory {
        id: "shared_apps_lib".into(),
        title: "Applications & Shared /Library".into(),
        subtitle: "Installed system applications and shared application support data.".into(),
        total_bytes: apps_lib_total,
        percentage_of_volume: if data_used > 0 {
            (apps_lib_total as f64 * 100.0) / data_used as f64
        } else {
            0.0
        },
        severity: "normal".into(),
        permission_blocked_count: 0,
        sub_items: apps_sub_items,
        available_actions: vec!["reveal".into()],
    });

    // 7. macOS Installer & Update Leftovers
    let mut inst_sub_items: Vec<DeepSubItem> = raw
        .iter()
        .filter(|i| i.tag == "inst_sub")
        .map(|i| DeepSubItem {
            name: i.name.clone(),
            path: i.path.clone(),
            bytes: i.bytes,
            is_deletable: false,
            kind: "folder".into(),
        })
        .collect();
    inst_sub_items.sort_by_key(|s| std::cmp::Reverse(s.bytes));
    let inst_total: u64 = inst_sub_items.iter().map(|s| s.bytes).sum();
    if inst_total > GIB {
        causes.push(Cause {
            bytes: Some(inst_total),
            text: "macOS installer leftover files hold this much.".into(),
            fix: "Cleared after pending macOS updates finish installing.".into(),
        });
    }
    categories.push(DeepCategory {
        id: "installer_leftovers".into(),
        title: "macOS installer & update leftovers".into(),
        subtitle: "Downloaded update packages and staging files.".into(),
        total_bytes: inst_total,
        percentage_of_volume: if data_used > 0 {
            (inst_total as f64 * 100.0) / data_used as f64
        } else {
            0.0
        },
        // macOS removes these itself; nothing here is app-reclaimable.
        severity: if inst_total > GIB {
            "warning".into()
        } else {
            "normal".into()
        },
        permission_blocked_count: 0,
        sub_items: inst_sub_items,
        available_actions: if inst_total > 0 {
            vec!["reveal".into()]
        } else {
            vec![]
        },
    });

    // 8. VM Swap & Sleep Image
    let mut vm_sub_items: Vec<DeepSubItem> = raw
        .iter()
        .filter(|i| i.tag == "vm_sub")
        .map(|i| DeepSubItem {
            name: i.name.clone(),
            path: i.path.clone(),
            bytes: i.bytes,
            is_deletable: false,
            kind: "file".into(),
        })
        .collect();
    vm_sub_items.sort_by_key(|s| std::cmp::Reverse(s.bytes));
    let vm_total: u64 = vm_sub_items.iter().map(|s| s.bytes).sum();
    categories.push(DeepCategory {
        id: "vm_swap".into(),
        title: "Swap & sleep image".into(),
        subtitle: "Dynamic swap memory and hibernation sleep image (cleared on restart).".into(),
        total_bytes: vm_total,
        percentage_of_volume: if data_used > 0 {
            (vm_total as f64 * 100.0) / data_used as f64
        } else {
            0.0
        },
        severity: if vm_total > 8 * GIB {
            "warning".into()
        } else {
            "normal".into()
        },
        permission_blocked_count: 0,
        sub_items: vm_sub_items,
        available_actions: vec![],
    });

    // 9. Other Data Root Folders (e.g. /System/Volumes/Data/usr, MobileSoftwareUpdate)
    let mut other_data_items: Vec<DeepSubItem> = raw
        .iter()
        .filter(|i| i.tag == "data_root")
        .map(|i| DeepSubItem {
            name: i.name.clone(),
            path: i.path.clone(),
            bytes: i.bytes,
            is_deletable: false,
            kind: "folder".into(),
        })
        .collect();
    other_data_items.sort_by_key(|s| std::cmp::Reverse(s.bytes));
    let other_data_total: u64 = other_data_items.iter().map(|s| s.bytes).sum();
    if other_data_total > 0 {
        categories.push(DeepCategory {
            id: "other_data_folders".into(),
            title: "Data volume system directories".into(),
            subtitle: "Additional system and update directories on /System/Volumes/Data.".into(),
            total_bytes: other_data_total,
            percentage_of_volume: if data_used > 0 {
                (other_data_total as f64 * 100.0) / data_used as f64
            } else {
                0.0
            },
            severity: "normal".into(),
            permission_blocked_count: 0,
            sub_items: other_data_items,
            available_actions: vec!["reveal".into()],
        });
    }

    // 10. APFS Metadata & Restricted Space
    let permission_denied_paths: Vec<String> = raw
        .iter()
        .filter(|i| i.tag == "eperm")
        .map(|i| i.path.clone())
        .collect();
    let perm_count = permission_denied_paths.len();

    // Measured total files across data volume
    let measured_sum = effective_user_total
        + other_users_total
        + dev_total
        + sys_total
        + apps_lib_total
        + inst_total
        + vm_total
        + other_data_total;

    let residual = data_used.saturating_sub(measured_sum + purgeable_bytes);

    // Accounts whose protected folders the root script couldn't open. macOS
    // never lets an admin-prompt shell use the app's FDA, so this survives a
    // grant; only logging into that account reveals them.
    let mut blocked_owners: Vec<String> = Vec::new();
    let mut unindexed_sub_items = Vec::new();
    for p in &permission_denied_paths {
        let leaf = p.rsplit('/').next().unwrap_or(p);
        let owner = p
            .strip_prefix("/Users/")
            .and_then(|r| r.split('/').next())
            .filter(|u| *u != me);
        let name = match (owner, leaf) {
            (Some(u), _) => {
                if !blocked_owners.iter().any(|b| b == u) {
                    blocked_owners.push(u.to_string());
                }
                format!("{leaf} ({u}'s account, unreadable)")
            }
            (None, ".Spotlight-V100") => "Spotlight index (unreadable)".into(),
            (None, _) => format!("{leaf} (unreadable)"),
        };
        unindexed_sub_items.push(DeepSubItem {
            name,
            path: p.clone(),
            bytes: 0,
            is_deletable: false,
            kind: "restricted".into(),
        });
    }
    if residual > 0 {
        unindexed_sub_items.push(DeepSubItem {
            name: "Not attributable to any folder".into(),
            path: "/System/Volumes/Data".into(),
            bytes: residual,
            is_deletable: false,
            kind: "restricted".into(),
        });
    }

    if !full_disk_access && residual > 0 {
        causes.push(Cause {
            bytes: Some(residual),
            text: "Stackroost doesn't have Full Disk Access, so protected folders (Mail, Messages, app containers) weren't measured.".into(),
            fix: "Grant Full Disk Access to Stackroost in System Settings → Privacy & Security, quit and reopen Stackroost, then run the deep scan again.".into(),
        });
    } else if residual > GIB {
        let fix = if blocked_owners.is_empty() {
            "This is the Spotlight index and APFS filesystem metadata. macOS manages it; there are no files here to delete.".to_string()
        } else {
            format!(
                "macOS hides other accounts' Mail, Messages and Safari data even from administrators. Log into {} to see it there; the rest is the Spotlight index and APFS metadata.",
                blocked_owners.join(", ")
            )
        };
        causes.push(Cause {
            bytes: Some(residual),
            text: "This much couldn't be attributed to a folder.".into(),
            fix,
        });
    }

    categories.push(DeepCategory {
        id: "unindexed_restricted".into(),
        title: "Unattributed space".into(),
        subtitle: if full_disk_access {
            "Other accounts' protected folders, the Spotlight index and APFS metadata — not readable by any app.".into()
        } else {
            "Protected folders Stackroost can't read without Full Disk Access, plus APFS metadata.".into()
        },
        total_bytes: residual,
        percentage_of_volume: if data_used > 0 {
            (residual as f64 * 100.0) / data_used as f64
        } else {
            0.0
        },
        severity: if (!full_disk_access && perm_count > 0) || residual > 10 * GIB {
            "warning".into()
        } else {
            "normal".into()
        },
        permission_blocked_count: perm_count,
        sub_items: unindexed_sub_items,
        available_actions: if full_disk_access {
            vec![]
        } else {
            vec!["grant_fda".into()]
        },
    });

    // Populate backward-compatible entries list for existing UI
    let mut entries = Vec::new();
    for cat in &categories {
        entries.push(DeepEntry {
            label: cat.title.clone(),
            why: cat.subtitle.clone(),
            bytes: cat.total_bytes,
            flagged: cat.severity != "normal",
        });
    }
    entries.sort_by_key(|e| std::cmp::Reverse(e.bytes));
    categories.sort_by_key(|c| std::cmp::Reverse(c.total_bytes));
    causes.sort_by_key(|c| std::cmp::Reverse(c.bytes.unwrap_or(0)));

    DeepReport {
        categories,
        entries,
        causes,
        total_data_used_bytes: data_used,
        purgeable_bytes,
        permission_denied_paths,
        full_disk_access,
    }
}

/// Backwards-compatible builder for tests and legacy callers.
pub fn build(raw: &[(String, u64)], me: &str, map: &[MapEntry], data_used: u64) -> DeepReport {
    let raw_items: Vec<RawItem> = raw
        .iter()
        .map(|(label, bytes)| {
            let (tag, name, path) = if let Some(user) = label.strip_prefix("u:") {
                (
                    "user_total".to_string(),
                    user.to_string(),
                    format!("/Users/{user}"),
                )
            } else if label.starts_with("/Applications") {
                ("app".to_string(), label.to_string(), label.to_string())
            } else if label.starts_with("/opt/homebrew")
                || label.starts_with("/usr/local")
                || label.starts_with("/Library/Developer")
            {
                (
                    "dev_total".to_string(),
                    label.to_string(),
                    label.to_string(),
                )
            } else if label.starts_with("/Library") {
                ("lib_sub".to_string(), label.to_string(), label.to_string())
            } else if label.contains("Install Data") || label.contains("Updates") {
                ("inst_sub".to_string(), label.to_string(), label.to_string())
            } else if label.starts_with("/private/var/vm") {
                ("vm_sub".to_string(), label.to_string(), label.to_string())
            } else {
                ("sys_sub".to_string(), label.to_string(), label.to_string())
            };
            RawItem {
                tag,
                name,
                path,
                bytes: *bytes,
            }
        })
        .collect();
    build_report(&raw_items, me, map, data_used, &[], 0, true)
}

/// Run the constant script as root via the native admin prompt, returning RawItems.
pub fn run_raw() -> AppResult<Vec<RawItem>> {
    let apple = format!(
        "do shell script {} with administrator privileges",
        applescript_quote(DEEP_SCRIPT)
    );
    let out = Command::new("/usr/bin/osascript")
        .args(["-e", &apple])
        .output()
        .map_err(|e| AppError::Shell(format!("couldn't start osascript: {e}")))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        if err.contains("-128") || err.contains("User canceled") {
            return Err(AppError::Cancelled(
                "Cancelled — nothing was measured.".into(),
            ));
        }
        return Err(AppError::Shell(err.trim().to_string()));
    }
    Ok(parse_raw_items(
        &String::from_utf8_lossy(&out.stdout).replace('\r', "\n"),
    ))
}

/// Whether Stackroost itself holds Full Disk Access: the TCC folder is listable
/// only with FDA (the check Apple's own tools use). Lists names, reads nothing.
pub fn has_full_disk_access() -> bool {
    std::fs::read_dir("/Library/Application Support/com.apple.TCC").is_ok()
}

/// User-level toolchain folders reported under "Developer" instead of the home.
const DEV_USER_DIRS: &[&str] = &[
    ".cargo", ".rustup", ".nvm", ".npm", ".bun", ".docker", ".vscode", ".cache", ".m2", ".gradle",
];

/// The current user's home, measured as the user. `du` is a child of the app,
/// so it carries Stackroost's FDA — unlike the root script. Emits the script's
/// row shapes (`user_total`, `user_sub`, `dev_user`) plus one `eperm` per
/// top-level/Library folder macOS still refused (e.g. without FDA).
pub fn measure_home(home: &std::path::Path, me: &str) -> AppResult<Vec<RawItem>> {
    let mut operands: Vec<String> = Vec::new();
    let children = |dir: &std::path::Path| -> Vec<String> {
        let mut v: Vec<String> = std::fs::read_dir(dir)
            .map(|rd| {
                rd.flatten()
                    .map(|e| e.path().to_string_lossy().into_owned())
                    .collect()
            })
            .unwrap_or_default();
        v.sort();
        v
    };
    for item in children(home) {
        if item.ends_with("/Library") {
            operands.extend(children(std::path::Path::new(&item)));
        } else {
            operands.push(item);
        }
    }
    if operands.is_empty() {
        return Ok(Vec::new());
    }
    let mut args = vec!["-skx".to_string(), "--".to_string()];
    args.extend(operands.iter().cloned());
    // du exits 1 when any subtree was refused; the sizes are still valid.
    let out = crate::core::exec::run(
        "/usr/bin/du",
        &args,
        crate::core::exec::ExecOpts::default()
            .with_timeout(std::time::Duration::from_secs(15 * 60))
            .with_max_out(16 * 1024 * 1024)
            .no_check_exit(),
    )?;
    Ok(parse_home_du(
        &out.stdout_str,
        &out.stderr_str,
        &home.to_string_lossy(),
        me,
        &operands,
    ))
}

/// Turn `du -sk` stdout (`KB\tpath`) and stderr (`du: path: Operation not
/// permitted`) over the home's operands into rows. Pure; tested below.
pub fn parse_home_du(
    stdout: &str,
    stderr: &str,
    home: &str,
    me: &str,
    operands: &[String],
) -> Vec<RawItem> {
    let home = home.trim_end_matches('/');
    let mut rows = Vec::new();
    let mut total = 0u64;
    for line in stdout.lines() {
        let Some((kb, path)) = line.split_once('\t') else {
            continue;
        };
        let Ok(kb) = kb.trim().parse::<u64>() else {
            continue;
        };
        let Some(rel) = path.strip_prefix(home).map(|r| r.trim_start_matches('/')) else {
            continue;
        };
        let bytes = kb * 1024;
        total += bytes;
        let tag = if DEV_USER_DIRS.contains(&rel) {
            "dev_user"
        } else {
            "user_sub"
        };
        let name = if tag == "dev_user" {
            rel.to_string()
        } else {
            format!("{me}/{rel}")
        };
        rows.push(RawItem {
            tag: tag.into(),
            name,
            path: path.to_string(),
            bytes,
        });
    }
    let mut denied: Vec<&String> = Vec::new();
    for line in stderr.lines() {
        if !(line.contains("Operation not permitted") || line.contains("Permission denied")) {
            continue;
        }
        let Some(p) = line.strip_prefix("du: ") else {
            continue;
        };
        if let Some(op) = operands.iter().find(|op| {
            p == op.as_str() || p.starts_with(&format!("{op}/")) || p.starts_with(&format!("{op}:"))
        }) {
            if !denied.contains(&op) {
                denied.push(op);
            }
        }
    }
    for op in denied {
        rows.push(RawItem {
            tag: "eperm".into(),
            name: op.rsplit('/').next().unwrap_or(op).to_string(),
            path: op.clone(),
            bytes: 0,
        });
    }
    rows.push(RawItem {
        tag: "user_total".into(),
        name: me.to_string(),
        path: home.to_string(),
        bytes: total,
    });
    rows
}

/// Run the constant script as root via the native admin prompt. A dismissed
/// prompt is `Cancelled` (AppleScript error -128), not a failure.
pub fn run() -> AppResult<Vec<(String, u64)>> {
    let items = run_raw()?;
    Ok(items
        .into_iter()
        .map(|item| {
            let label = if item.tag == "user_total" {
                format!("u:{}", item.name)
            } else {
                item.path
            };
            (label, item.bytes)
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_root_script_only_measures() {
        let code = DEEP_SCRIPT.to_lowercase();
        for banned in [
            "rm ", "mv ", "chmod", "chown", " > ", ">>", "sudo", "tee ", "dd ", "kill",
        ] {
            assert!(!code.contains(banned), "deep script contains {banned:?}");
        }
        assert!(code.contains("du -skx"));
    }

    #[test]
    fn applescript_quoting_escapes_quotes_and_backslashes() {
        assert_eq!(applescript_quote(r#"a "b" \c"#), r#""a \"b\" \\c""#);
        // The real script round-trips: no unescaped quote can end the literal early.
        let q = applescript_quote(DEEP_SCRIPT);
        let inner = &q[1..q.len() - 1];
        let mut prev_backslash = false;
        for ch in inner.chars() {
            assert!(!(ch == '"' && !prev_backslash), "unescaped quote");
            prev_backslash = ch == '\\' && !prev_backslash;
        }
    }

    #[test]
    fn deep_section_matches_the_script() {
        let gib = |n: u64| n * GIB;
        let raw = vec![
            ("u:me".to_string(), gib(60)),
            ("u:arpit".to_string(), gib(12)),
            ("/private/var/folders".to_string(), gib(4)),
            (
                "/System/Volumes/Data/macOS Install Data".to_string(),
                gib(0),
            ),
            ("/Library".to_string(), gib(9)),
        ];
        let map = vec![
            MapEntry {
                id: "library",
                label: String::new(),
                bytes: gib(25),
                note: None,
            },
            MapEntry {
                id: "desktop",
                label: String::new(),
                bytes: gib(20),
                note: None,
            },
            MapEntry {
                id: "apps",
                label: String::new(),
                bytes: gib(12),
                note: None,
            },
            MapEntry {
                id: "other",
                label: String::new(),
                bytes: gib(90),
                note: None,
            },
        ];
        let d = build(&raw, "me", &map, gib(150));
        let by_cat = |id: &str| d.categories.iter().find(|c| c.id == id).unwrap();
        assert_eq!(by_cat("current_user").total_bytes, gib(60));
        assert_eq!(by_cat("other_users").total_bytes, gib(12));
        assert_eq!(by_cat("other_users").severity, "warning");
        assert_eq!(by_cat("system_data").total_bytes, gib(4));
        assert_eq!(
            by_cat("system_data").severity,
            "warning",
            "over 3 GB temp caches"
        );

        // 150 − (60 + 12 + 4 + 0 + 9) = 65 GB unindexed / permission restricted.
        let unindexed = by_cat("unindexed_restricted");
        assert_eq!(unindexed.total_bytes, gib(65));
        assert_eq!(unindexed.title, "Unattributed space");

        // Real snapshots are separate and 0 because none exist in this fixture:
        assert_eq!(by_cat("snapshots_purgeable").total_bytes, 0);

        assert!(d.causes.iter().any(|c| c.text.contains("arpit")));
    }

    #[test]
    fn root_script_skips_the_console_user() {
        assert!(DEEP_SCRIPT.contains("stat -f %Su /dev/console"));
        assert!(DEEP_SCRIPT.contains(r#"[ "$n" = "$me" ] && continue"#));
        // Other users' toolchains stay inside their account total (no double count).
        assert!(!DEEP_SCRIPT.contains("dev_user"));
    }

    #[test]
    fn home_du_rows_split_dev_dirs_and_collect_denials() {
        let home = "/Users/me";
        let ops: Vec<String> = [
            "/Users/me/Desktop",
            "/Users/me/.cargo",
            "/Users/me/Library/Group Containers",
            "/Users/me/Library/Mail",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        let stdout = "1000\t/Users/me/Desktop\n200\t/Users/me/.cargo\n3000\t/Users/me/Library/Group Containers\n0\t/Users/me/Library/Mail\n";
        let stderr = "du: /Users/me/Library/Group Containers/group.x: Operation not permitted\n\
                      du: /Users/me/Library/Group Containers/group.y: Operation not permitted\n\
                      du: /Users/me/Library/Mail: Operation not permitted\n";
        let rows = parse_home_du(stdout, stderr, home, "me", &ops);
        let get = |tag: &str, name: &str| rows.iter().find(|r| r.tag == tag && r.name == name);
        assert_eq!(get("user_sub", "me/Desktop").unwrap().bytes, 1000 * 1024);
        assert_eq!(get("dev_user", ".cargo").unwrap().bytes, 200 * 1024);
        assert_eq!(
            get("user_sub", "me/Library/Group Containers")
                .unwrap()
                .bytes,
            3000 * 1024
        );
        assert_eq!(get("user_total", "me").unwrap().bytes, 4200 * 1024);
        let denied: Vec<&str> = rows
            .iter()
            .filter(|r| r.tag == "eperm")
            .map(|r| r.path.as_str())
            .collect();
        assert_eq!(
            denied,
            [
                "/Users/me/Library/Group Containers",
                "/Users/me/Library/Mail"
            ]
        );
    }

    #[test]
    fn unattributed_space_only_blames_fda_when_it_is_missing() {
        let raw = vec![
            RawItem {
                tag: "user_total".into(),
                name: "me".into(),
                path: "/Users/me".into(),
                bytes: 40 * GIB,
            },
            RawItem {
                tag: "eperm".into(),
                name: "Mail".into(),
                path: "/Users/other/Library/Mail".into(),
                bytes: 0,
            },
        ];
        let with = build_report(&raw, "me", &[], 60 * GIB, &[], 0, true);
        let cat = with
            .categories
            .iter()
            .find(|c| c.id == "unindexed_restricted")
            .unwrap();
        assert_eq!(cat.total_bytes, 20 * GIB);
        assert!(cat.available_actions.is_empty());
        assert_eq!(cat.sub_items[0].name, "Mail (other's account, unreadable)");
        assert!(with.full_disk_access);
        assert!(!with
            .causes
            .iter()
            .any(|c| c.fix.contains("Grant Full Disk Access")));
        assert!(with.causes.iter().any(|c| c.fix.contains("Log into other")));

        let without = build_report(&raw, "me", &[], 60 * GIB, &[], 0, false);
        assert!(without
            .causes
            .iter()
            .any(|c| c.fix.contains("Grant Full Disk Access")));
    }

    #[test]
    fn output_parsing_skips_missing_paths() {
        let r = parse_output("u:me\t100\n/private/var/vm\t\n/Library\t2\n");
        assert_eq!(r, [("u:me".into(), 100 * 1024), ("/Library".into(), 2048)]);
    }

    #[test]
    fn snapshots_and_purgeable_category_aggregation() {
        let gib = |n: u64| n * GIB;
        let snapshots = vec![SnapshotInfo {
            name: "com.apple.TimeMachine.2026-10-24-120000.local".to_string(),
            kind: "time_machine".to_string(),
            is_deletable: true,
            ..Default::default()
        }];
        let raw = vec![RawItem {
            tag: "user_total".into(),
            name: "me".into(),
            path: "/Users/me".into(),
            bytes: gib(50),
        }];
        let map = vec![];
        let d = build_report(&raw, "me", &map, gib(100), &snapshots, gib(15), true);
        let snap_cat = d
            .categories
            .iter()
            .find(|c| c.id == "snapshots_purgeable")
            .unwrap();
        assert_eq!(snap_cat.total_bytes, gib(15));
        assert_eq!(snap_cat.severity, "actionable");
        assert_eq!(snap_cat.sub_items.len(), 2);
        assert_eq!(snap_cat.sub_items[0].kind, "time_machine");
        assert_eq!(snap_cat.sub_items[1].kind, "cache");
        assert_eq!(d.purgeable_bytes, gib(15));
    }

    #[test]
    fn developer_and_installer_categories() {
        let gib = |n: u64| n * GIB;
        let raw = vec![
            ("u:me".to_string(), gib(40)),
            (
                "/System/Volumes/Data/macOS Install Data".to_string(),
                gib(8),
            ),
            ("/private/var/vm".to_string(), gib(4)),
        ];
        let map = vec![];
        let d = build(&raw, "me", &map, gib(80));
        let installer_cat = d
            .categories
            .iter()
            .find(|c| c.id == "installer_leftovers")
            .unwrap();
        assert_eq!(installer_cat.total_bytes, gib(8));
        assert_eq!(installer_cat.severity, "warning");
        // Root/SIP-owned: the app can't delete it, so it must not offer to.
        assert!(installer_cat.sub_items.iter().all(|s| !s.is_deletable));

        let vm_cat = d.categories.iter().find(|c| c.id == "vm_swap").unwrap();
        assert_eq!(vm_cat.total_bytes, gib(4));
    }

    // The exact osascript path minus "with administrator privileges": proves
    // the quoting and the script itself on this Mac, as the user (no prompt).
    // cargo test deep_script_runs -- --ignored --nocapture
    #[test]
    #[ignore]
    fn deep_script_runs_through_osascript_as_user() {
        let apple = format!("do shell script {}", applescript_quote(DEEP_SCRIPT));
        let out = Command::new("/usr/bin/osascript")
            .args(["-e", &apple])
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
        let rows = parse_output(&String::from_utf8_lossy(&out.stdout).replace('\r', "\n"));
        for (l, b) in &rows {
            println!("  {l:<45} {:>7.1} GB", *b as f64 / GIB as f64);
        }
        assert!(
            rows.iter().any(|(l, _)| l.starts_with("u:")),
            "user homes listed"
        );
        assert!(rows.iter().any(|(l, _)| l == "/Library"));
    }
}
