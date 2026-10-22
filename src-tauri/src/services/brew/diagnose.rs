//! "Why won't this service start?" — `brew services start` returns success even
//! when the daemon dies a second later, so the UI only ever saw `error`/`stopped`.
//! This runs the daemon's own *read-only* self-check (config test / `--version`,
//! which is where dyld "Library not loaded" surfaces), tails its log, and maps the
//! common failures to a cause + fix. Never starts or wakes anything.

use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;

use crate::core::exec::{self, ExecOpts};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosisCheck {
    pub label: String,
    pub command: String,
    pub ok: bool,
    pub output: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum FixKind {
    /// Run `command` in a terminal (e.g. `brew reinstall mysql`).
    RunCommand,
    /// Open `path` (at `line`) and correct it.
    EditConfig,
    /// Something else holds the port — Ports tab.
    FreePort,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosisFix {
    pub kind: FixKind,
    pub summary: String,
    pub command: Option<String>,
    pub path: Option<String>,
    pub line: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceDiagnosis {
    pub name: String,
    pub cause: Option<String>,
    pub fix: Option<DiagnosisFix>,
    pub checks: Vec<DiagnosisCheck>,
    pub log_path: Option<String>,
    pub log_tail: Vec<String>,
}

const LOG_LINES: usize = 40;

/// Self-check argv + log file for the formulae brew users actually run.
fn probe_plan(prefix: &str, formula: &str) -> (Vec<(String, Vec<String>)>, Option<PathBuf>) {
    let base = formula.split('@').next().unwrap_or(formula);
    let opt = format!("{prefix}/opt/{formula}");
    let var = PathBuf::from(prefix).join("var");
    let check = |bin: String, args: &[&str]| (bin, args.iter().map(|a| (*a).to_string()).collect());
    match base {
        "nginx" => (
            vec![check(format!("{opt}/bin/nginx"), &["-t"])],
            Some(var.join("log/nginx/error.log")),
        ),
        "mysql" | "mariadb" | "percona-server" => (
            vec![check(format!("{opt}/bin/mysqld"), &["--version"])],
            newest_with_ext(&var.join("mysql"), "err"),
        ),
        "postgresql" | "postgres" => (
            vec![check(format!("{opt}/bin/postgres"), &["--version"])],
            Some(var.join(format!("log/{formula}.log"))),
        ),
        "redis" | "valkey" => (
            vec![check(format!("{opt}/bin/{base}-server"), &["--version"])],
            Some(var.join(format!("log/{base}.log"))),
        ),
        "mongodb-community" | "mongodb" => (
            vec![check(format!("{opt}/bin/mongod"), &["--version"])],
            Some(var.join("log/mongodb/mongo.log")),
        ),
        "php" => (
            vec![check(format!("{opt}/sbin/php-fpm"), &["-t"])],
            Some(var.join("log/php-fpm.log")),
        ),
        _ => {
            let bin = [format!("{opt}/bin/{base}"), format!("{opt}/sbin/{base}")]
                .into_iter()
                .find(|p| Path::new(p).exists());
            (
                bin.map(|b| vec![check(b, &["--version"])])
                    .unwrap_or_default(),
                Some(var.join(format!("log/{base}.log"))),
            )
        }
    }
}

fn newest_with_ext(dir: &Path, ext: &str) -> Option<PathBuf> {
    std::fs::read_dir(dir)
        .ok()?
        .filter_map(Result::ok)
        .filter(|e| e.path().extension().is_some_and(|x| x == ext))
        .max_by_key(|e| e.metadata().and_then(|m| m.modified()).ok())
        .map(|e| e.path())
}

/// Last `n` lines of a (possibly huge) log — reads only the tail.
fn tail(path: &Path, n: usize) -> Vec<String> {
    use std::io::{Read, Seek, SeekFrom};
    let Ok(mut f) = std::fs::File::open(path) else {
        return vec![];
    };
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    let start = len.saturating_sub(64 * 1024);
    if f.seek(SeekFrom::Start(start)).is_err() {
        return vec![];
    }
    let mut buf = Vec::new();
    if f.read_to_end(&mut buf).is_err() {
        return vec![];
    }
    let text = String::from_utf8_lossy(&buf);
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(n)..]
        .iter()
        .map(|l| l.chars().take(400).collect())
        .collect()
}

pub fn diagnose(prefix: &str, formula: &str) -> ServiceDiagnosis {
    let (plan, log) = probe_plan(prefix, formula);
    let checks: Vec<DiagnosisCheck> = plan
        .into_iter()
        .map(|(bin, args)| {
            let command = format!("{} {}", bin, args.join(" "));
            let label = Path::new(&bin)
                .file_name()
                .map(|n| format!("{} self-check", n.to_string_lossy()))
                .unwrap_or_else(|| "self-check".into());
            if !Path::new(&bin).exists() {
                return DiagnosisCheck {
                    label,
                    command,
                    ok: false,
                    output: format!("{bin} not found — the formula may not be fully installed."),
                };
            }
            let opts = ExecOpts::default()
                .with_timeout(Duration::from_secs(10))
                .with_max_out(32 * 1024)
                .no_check_exit();
            match exec::run(&bin, &args, opts) {
                Ok(out) => DiagnosisCheck {
                    label,
                    command,
                    ok: out.status.success(),
                    output: format!("{}{}", out.stdout_str, out.stderr_str)
                        .trim()
                        .to_string(),
                },
                Err(e) => DiagnosisCheck {
                    label,
                    command,
                    ok: false,
                    output: e.to_string(),
                },
            }
        })
        .collect();
    let log_tail = log
        .as_deref()
        .map(|p| tail(p, LOG_LINES))
        .unwrap_or_default();
    let (cause, fix) = classify(formula, &checks, &log_tail);
    ServiceDiagnosis {
        name: formula.to_string(),
        cause,
        fix,
        checks,
        log_path: log.map(|p| p.to_string_lossy().into_owned()),
        log_tail,
    }
}

/// Pure: evidence → plain-English cause + fix. Failed self-checks outrank the
/// log, and within the log the *latest* matching line wins (old errors that
/// were already fixed sit higher up).
pub fn classify(
    formula: &str,
    checks: &[DiagnosisCheck],
    log_tail: &[String],
) -> (Option<String>, Option<DiagnosisFix>) {
    let failed: Vec<&str> = checks
        .iter()
        .filter(|c| !c.ok)
        .map(|c| c.output.as_str())
        .collect();
    let evidence: Vec<&str> = failed
        .iter()
        .flat_map(|o| o.lines())
        .chain(log_tail.iter().rev().map(String::as_str))
        .collect();

    for line in &evidence {
        if let Some(lib) = line.split("Library not loaded:").nth(1) {
            let lib = lib.trim();
            return (
                Some(format!(
                    "{formula} was built against a library Homebrew has since upgraded or removed ({lib}). The daemon crashes before it can start."
                )),
                Some(DiagnosisFix {
                    kind: FixKind::RunCommand,
                    summary: format!("Reinstall {formula} so it links against the current libraries."),
                    command: Some(format!("brew reinstall {formula}")),
                    path: None,
                    line: None,
                }),
            );
        }
    }
    for line in &evidence {
        if let Some((msg, path, ln)) = parse_config_error(line) {
            return (
                Some(format!("Configuration error: {msg}")),
                Some(DiagnosisFix {
                    kind: FixKind::EditConfig,
                    summary: format!("Fix line {ln} of {path}, then start the service again."),
                    command: None,
                    path: Some(path),
                    line: Some(ln),
                }),
            );
        }
    }
    for line in &evidence {
        let l = line.to_ascii_lowercase();
        if l.contains("address already in use") || l.contains("bind() to") && l.contains("failed") {
            return (
                Some("Another process is already using this service's port.".into()),
                Some(DiagnosisFix {
                    kind: FixKind::FreePort,
                    summary: "Find and stop the process holding the port in Ports.".into(),
                    command: None,
                    path: None,
                    line: None,
                }),
            );
        }
        if l.contains("permission denied") {
            return (Some(format!("Permission denied: {}", line.trim())), None);
        }
        if l.contains("postmaster.pid") && l.contains("already exists")
            || l.contains("unable to lock") && l.contains("ibdata1")
        {
            return (
                Some(
                    "A previous instance is still running or left a stale lock/pid file behind."
                        .into(),
                ),
                None,
            );
        }
    }
    if let Some(out) = failed.first() {
        let first = out.lines().next().unwrap_or("self-check failed");
        return (Some(first.to_string()), None);
    }
    (None, None)
}

/// nginx/php-fpm style: `… [emerg] <msg> in /path/file.conf:15`.
fn parse_config_error(line: &str) -> Option<(String, String, u32)> {
    let lower = line.to_ascii_lowercase();
    if !(lower.contains("[emerg]") || lower.contains("error:") || lower.contains("[error]")) {
        return None;
    }
    let (msg_part, loc) = line.rsplit_once(" in ")?;
    let (path, ln) = loc.trim().rsplit_once(':')?;
    let ln: u32 = ln.trim().parse().ok()?;
    if !path.starts_with('/') {
        return None;
    }
    let mut msg = msg_part.rsplit_once("] ").map_or(msg_part, |(_, m)| m);
    // Log lines carry a `<pid>#<tid>: ` prefix after the level; drop it.
    if let Some((head, rest)) = msg.split_once(": ") {
        if head.chars().all(|c| c.is_ascii_digit() || c == '#') {
            msg = rest;
        }
    }
    Some((msg.trim().to_string(), path.to_string(), ln))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn failed(output: &str) -> DiagnosisCheck {
        DiagnosisCheck {
            label: "x".into(),
            command: "x".into(),
            ok: false,
            output: output.into(),
        }
    }

    #[test]
    fn dyld_missing_library_suggests_reinstall() {
        let log = vec![
            "dyld[21504]: Library not loaded: /opt/homebrew/opt/protobuf@29/lib/libprotobuf-lite.29.4.0.dylib".to_string(),
        ];
        let (cause, fix) = classify("mysql", &[], &log);
        assert!(cause.unwrap().contains("libprotobuf-lite"));
        let fix = fix.unwrap();
        assert_eq!(fix.kind, FixKind::RunCommand);
        assert_eq!(fix.command.as_deref(), Some("brew reinstall mysql"));
    }

    #[test]
    fn nginx_config_error_points_at_file_and_line() {
        let check = failed(
            "nginx: [emerg] \"server\" directive is not allowed here in /opt/homebrew/etc/nginx/nginx.conf:15\nnginx: configuration file /opt/homebrew/etc/nginx/nginx.conf test failed",
        );
        let (cause, fix) = classify("nginx", &[check], &[]);
        assert_eq!(
            cause.as_deref(),
            Some("Configuration error: \"server\" directive is not allowed here")
        );
        let fix = fix.unwrap();
        assert_eq!(fix.kind, FixKind::EditConfig);
        assert_eq!(
            fix.path.as_deref(),
            Some("/opt/homebrew/etc/nginx/nginx.conf")
        );
        assert_eq!(fix.line, Some(15));
    }

    #[test]
    fn port_in_use_points_at_ports() {
        let log = vec![
            "2026/10/22 [emerg] bind() to 0.0.0.0:8080 failed (48: Address already in use)"
                .to_string(),
        ];
        let (_, fix) = classify("nginx", &[], &log);
        assert_eq!(fix.unwrap().kind, FixKind::FreePort);
    }

    #[test]
    fn healthy_service_has_no_cause() {
        let ok = DiagnosisCheck {
            label: "x".into(),
            command: "x".into(),
            ok: true,
            output: "mysqld Ver 9.3.0".into(),
        };
        assert_eq!(
            classify("mysql", &[ok], &["ready for connections".into()]),
            (None, None)
        );
    }

    #[test]
    #[ignore = "hits the real Homebrew install"]
    fn real_brew_services() {
        for f in ["nginx", "mysql"] {
            let d = diagnose("/opt/homebrew", f);
            eprintln!(
                "{f}: cause={:?}\n  fix={:?}\n  log={:?} ({} lines)",
                d.cause,
                d.fix,
                d.log_path,
                d.log_tail.len()
            );
        }
    }
}
