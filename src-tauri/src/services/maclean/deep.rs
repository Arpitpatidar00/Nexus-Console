// Deep scan (docs/maclean/PLAN.md §3.7): the script's `--deep`, through the
// native macOS admin prompt. ONE constant, read-only script runs as root:
// `du` over fixed system paths and the user homes. Nothing from the frontend
// or the filesystem is ever spliced into it; nothing deletes as root.

use super::scan::{Cause, MapEntry};
use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::process::Command;

const GIB: u64 = 1024 * 1024 * 1024;

/// Prints `label<TAB>KB` lines. `u:<name>` = a user's home.
pub const DEEP_SCRIPT: &str = r#"for u in /Users/*; do n=${u##*/}; case $n in Shared|Guest|.localized) continue ;; esac; printf 'u:%s\t' "$n"; du -skx "$u" 2>/dev/null | cut -f1; done
for p in /System/Volumes/Data/System /Library /private/var/db /private/var/folders /private/var/vm '/System/Volumes/Data/macOS Install Data'; do printf '%s\t' "$p"; du -skx "$p" 2>/dev/null | cut -f1; done"#;

/// AppleScript string literal for `do shell script "…"`.
pub fn applescript_quote(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

/// `label\tKB` lines → (label, bytes). Lines without a number are skipped
/// (a path that didn't exist prints an empty size).
pub fn parse_output(out: &str) -> Vec<(String, u64)> {
    out.lines()
        .filter_map(|l| {
            let (label, kb) = l.split_once('\t')?;
            Some((label.to_string(), kb.trim().parse::<u64>().ok()? * 1024))
        })
        .collect()
}

#[derive(Debug, Clone, PartialEq, Serialize)]
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
    pub entries: Vec<DeepEntry>,
    pub causes: Vec<Cause>,
}

fn meta(path: &str) -> (&'static str, &'static str, u64) {
    match path {
        "/System/Volumes/Data/System" => (
            "System data (/System)",
            "Fonts, Siri & ML models, system assets.",
            u64::MAX,
        ),
        "/Library" => (
            "Shared /Library",
            "System-wide app support & caches.",
            u64::MAX,
        ),
        "/private/var/db" => (
            "System databases",
            "Logs, diagnostics, Spotlight index.",
            u64::MAX,
        ),
        "/private/var/folders" => (
            "Temp & per-app caches",
            "Cleared automatically on restart.",
            3 * GIB,
        ),
        "/private/var/vm" => ("Swap & sleep image", "Resets on restart.", u64::MAX),
        _ => (
            "macOS installer files",
            "Leftovers from macOS updates.",
            GIB,
        ),
    }
}

/// Turn raw sizes into the script's deep-scan section. `me` is the current
/// user; `map` the last storage report's rows (to avoid counting the home
/// folders it already measured twice); `data_used` the Data volume's usage.
pub fn build(raw: &[(String, u64)], me: &str, map: &[MapEntry], data_used: u64) -> DeepReport {
    let mut entries = Vec::new();
    let mut causes = Vec::new();
    let measured_in_home: u64 = map
        .iter()
        .filter(|m| {
            matches!(
                m.id,
                "desktop" | "library" | "docker" | "devtools" | "downloads"
            )
        })
        .map(|m| m.bytes)
        .sum();
    let known: u64 = map
        .iter()
        .filter(|m| m.id != "macos" && m.id != "other")
        .map(|m| m.bytes)
        .sum();
    for (label, bytes) in raw {
        if let Some(user) = label.strip_prefix("u:") {
            if user == me {
                entries.push(DeepEntry {
                    label: "Your home: app containers & other folders".into(),
                    why: "Home folders not in the map above, incl. other apps' containers.".into(),
                    bytes: bytes.saturating_sub(measured_in_home),
                    flagged: false,
                });
            } else {
                entries.push(DeepEntry {
                    label: format!("User: {user}"),
                    why: "Another account's files.".into(),
                    bytes: *bytes,
                    flagged: true,
                });
                causes.push(Cause {
                    bytes: Some(*bytes),
                    text: format!("The {user} account holds this much."),
                    fix: "Delete it in System Settings → Users & Groups if unused, or log into it and clean there."
                        .into(),
                });
            }
        } else {
            let (l, why, limit) = meta(label);
            let flagged = *bytes > limit;
            if flagged {
                causes.push(Cause {
                    bytes: Some(*bytes),
                    text: format!("{l} is large."),
                    fix: if label.contains("Install Data") {
                        "Cleared after the pending macOS update installs.".into()
                    } else {
                        "Restart your Mac to clear temporary files.".into()
                    },
                });
            }
            entries.push(DeepEntry {
                label: l.into(),
                why: why.into(),
                bytes: *bytes,
                flagged,
            });
        }
    }
    let sum: u64 = entries.iter().map(|e| e.bytes).sum();
    let hidden = data_used.saturating_sub(known + sum);
    let flagged = hidden > 5 * GIB;
    if flagged {
        causes.push(Cause {
            bytes: Some(hidden),
            text: "APFS snapshots and purgeable space hold this much.".into(),
            fix: "Mostly from a pending macOS update or Time Machine: install the update, then restart.".into(),
        });
    }
    entries.push(DeepEntry {
        label: "Snapshots & purgeable".into(),
        why: "Held by APFS snapshots; not visible as files.".into(),
        bytes: hidden,
        flagged,
    });
    entries.sort_by_key(|e| std::cmp::Reverse(e.bytes));
    causes.sort_by_key(|c| std::cmp::Reverse(c.bytes.unwrap_or(0)));
    DeepReport { entries, causes }
}

/// Run the constant script as root via the native admin prompt. A dismissed
/// prompt is `Cancelled` (AppleScript error -128), not a failure.
pub fn run() -> AppResult<Vec<(String, u64)>> {
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
    // `do shell script` turns \n into \r in its result.
    Ok(parse_output(
        &String::from_utf8_lossy(&out.stdout).replace('\r', "\n"),
    ))
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
        let by = |l: &str| d.entries.iter().find(|e| e.label.starts_with(l)).unwrap();
        assert_eq!(
            by("Your home").bytes,
            gib(15),
            "home minus what the map measured"
        );
        assert!(by("User: arpit").flagged);
        assert!(by("Temp").flagged, "over 3 GB");
        assert!(!by("macOS installer").flagged);
        // 150 − (57 known + 15 + 12 + 4 + 0 + 9) = 53 GB hidden.
        assert_eq!(by("Snapshots").bytes, gib(53));
        assert_eq!(d.causes[0].bytes, Some(gib(53)), "biggest cause first");
        assert!(d.causes.iter().any(|c| c.text.contains("arpit")));
    }

    #[test]
    fn output_parsing_skips_missing_paths() {
        let r = parse_output("u:me\t100\n/private/var/vm\t\n/Library\t2\n");
        assert_eq!(r, [("u:me".into(), 100 * 1024), ("/Library".into(), 2048)]);
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
