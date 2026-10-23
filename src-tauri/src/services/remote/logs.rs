// Recent container logs for the Logs tab: a bounded, read-only `docker logs`.
// Live following stays in the terminal drawer (PtyTarget::RemoteLogs).

use super::ssh::{self, SshTarget};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::time::Duration;

pub const MIN_TAIL: u32 = 50;
pub const MAX_TAIL: u32 = 5_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    /// Docker's RFC 3339 receive time, when the line had one.
    pub at: Option<String>,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ContainerLogs {
    pub container: String,
    pub tail: u32,
    pub lines: Vec<LogLine>,
}

// stderr is folded into stdout on the server, so both streams arrive in the
// order Docker recorded them (ssh keeps only 64 KiB of its own stderr).
// `$1` is the container (validated against the latest snapshot), `$2` the tail.
const LOGS_SCRIPT: &str = r#"exec docker logs --timestamps --tail "$2" "$1" 2>&1
"#;

pub fn container_logs(target: &SshTarget, container: &str, tail: u32) -> AppResult<ContainerLogs> {
    let tail = tail.clamp(MIN_TAIL, MAX_TAIL);
    let tail_arg = tail.to_string();
    let out = ssh::exec(
        target,
        &["sh", "-s", "--", container, &tail_arg],
        Some(LOGS_SCRIPT.as_bytes()),
        Duration::from_secs(20),
    )?;
    let text = String::from_utf8_lossy(&out.stdout);
    if !out.status.success() {
        let first = text.lines().next().unwrap_or("docker logs failed").trim();
        return Err(AppError::Shell(first.to_string()));
    }
    Ok(ContainerLogs {
        container: container.to_string(),
        tail,
        lines: parse_logs(&text),
    })
}

/// `2026-10-23T12:14:50.155500608Z message` → time + message, ANSI colours
/// stripped (apps colour their own output; the viewer colours by level).
pub fn parse_logs(output: &str) -> Vec<LogLine> {
    output
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| {
            let (at, rest) = match l.split_once(' ') {
                Some((ts, rest)) if looks_like_timestamp(ts) => (Some(ts.to_string()), rest),
                _ => (None, l),
            };
            LogLine {
                at,
                text: strip_ansi(rest),
            }
        })
        .collect()
}

fn looks_like_timestamp(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() >= 20 && b[4] == b'-' && b[7] == b'-' && b[10] == b'T' && b[0].is_ascii_digit()
}

fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                chars.next();
                // CSI: parameters/intermediates, then one final byte in @..~
                for n in chars.by_ref() {
                    if ('@'..='~').contains(&n) {
                        break;
                    }
                }
            }
            continue;
        }
        if c == '\r' {
            continue;
        }
        out.push(c);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_timestamps_and_strips_colour() {
        let raw =
            "2026-10-23T12:14:50.155500608Z \u{1b}[32minfo\u{1b}[39m: server listening on 4101\r\n\
                   2026-10-23T12:14:51.000000000Z {\"level\":\"error\",\"msg\":\"redis down\"}\n\
                   \n\
                   plain line without a time\n";
        let lines = parse_logs(raw);
        assert_eq!(lines.len(), 3);
        assert_eq!(
            lines[0].at.as_deref(),
            Some("2026-10-23T12:14:50.155500608Z")
        );
        assert_eq!(lines[0].text, "info: server listening on 4101");
        assert_eq!(
            lines[1].text,
            "{\"level\":\"error\",\"msg\":\"redis down\"}"
        );
        assert_eq!(lines[2].at, None);
        assert_eq!(lines[2].text, "plain line without a time");
    }

    #[test]
    fn script_takes_container_and_tail_as_arguments_only() {
        assert!(LOGS_SCRIPT.contains("\"$1\"") && LOGS_SCRIPT.contains("\"$2\""));
    }
}
