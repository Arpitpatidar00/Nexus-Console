use crate::core::exec::{self, ExecOpts};
use serde::{Deserialize, Serialize};
use std::net::TcpStream;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredDb {
    pub name: String,
    pub driver: String,
    pub port: u16,
    pub source: String,
    pub data_dir: Option<String>,
}

fn port_open(port: u16) -> bool {
    TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], port)),
        Duration::from_millis(150),
    )
    .is_ok()
}

/// pid of the first process listening on `port` on loopback, via `lsof -t`.
/// Read-only, short timeout — this only decides which process to ask for its
/// real data directory, it never touches the process.
fn pid_for_port(port: u16) -> Option<u32> {
    let opts = ExecOpts::default().with_timeout(Duration::from_secs(3));
    let out = exec::run(
        "lsof",
        &["-nP", "-iTCP", &format!(":{port}"), "-sTCP:LISTEN", "-t"],
        opts,
    )
    .ok()?;
    out.stdout_str.lines().next()?.trim().parse().ok()
}

/// The full argv of `pid`, space-joined, via `ps -o command=`.
fn process_args(pid: u32) -> Option<String> {
    let opts = ExecOpts::default().with_timeout(Duration::from_secs(3));
    let out = exec::run("ps", &["-o", "command=", "-p", &pid.to_string()], opts).ok()?;
    let s = out.stdout_str.trim();
    (!s.is_empty()).then(|| s.to_string())
}

/// Find `<flag> <value>` (space-separated) or `<flag>=<value>` in a shell-like
/// argv string. Good enough for the flags below, which are never quoted with
/// embedded spaces in practice (data directories don't contain `=` either).
fn extract_flag_value(args: &str, flag: &str) -> Option<String> {
    let tokens: Vec<&str> = args.split_whitespace().collect();
    let prefix = format!("{flag}=");
    for (i, tok) in tokens.iter().enumerate() {
        if let Some(v) = tok.strip_prefix(&prefix) {
            return Some(v.to_string());
        }
        if *tok == flag {
            return tokens.get(i + 1).map(|v| v.to_string());
        }
    }
    None
}

/// The real data directory for the Postgres instance listening on `port`:
/// the running postmaster's own `-D` argument, not a guess from the formula
/// name. Guessing `postgresql@16` then `@15` then plain missed `@17`, and
/// picked the wrong directory whenever a different version was actually
/// running on the port (AUDIT-2026-10-24 BUG-10).
fn postgres_data_dir(port: u16) -> Option<String> {
    let dir = pid_for_port(port)
        .and_then(process_args)
        .and_then(|a| extract_flag_value(&a, "-D").or_else(|| extract_flag_value(&a, "--pgdata")));
    dir.or_else(|| {
        [
            "postgresql@17",
            "postgresql@16",
            "postgresql@15",
            "postgresql@14",
            "postgresql",
        ]
        .into_iter()
        .find_map(homebrew_db_dir)
    })
}

/// Same idea for MySQL: `--datadir=<path>` from the running `mysqld`.
fn mysql_data_dir(port: u16) -> Option<String> {
    pid_for_port(port)
        .and_then(process_args)
        .and_then(|a| extract_flag_value(&a, "--datadir"))
        .or_else(|| homebrew_db_dir("mysql"))
}

/// Same idea for MongoDB: `--dbpath <path>` from the running `mongod`.
fn mongo_data_dir(port: u16) -> Option<String> {
    pid_for_port(port)
        .and_then(process_args)
        .and_then(|a| extract_flag_value(&a, "--dbpath"))
        .or_else(|| homebrew_db_dir("mongodb-community"))
}

/// Probes the engines' default ports only — a non-default port (e.g. a
/// Docker container remapped to 55432) is not discovered here; add it as a
/// connection by pasting its URL instead (AUDIT-2026-10-24 BUG-10).
pub fn discover_local_databases() -> Vec<DiscoveredDb> {
    let mut list = Vec::new();

    if port_open(5432) {
        list.push(DiscoveredDb {
            name: "Local PostgreSQL".to_string(),
            driver: "postgres".to_string(),
            port: 5432,
            source: "Homebrew / Local".to_string(),
            data_dir: postgres_data_dir(5432),
        });
    }

    if port_open(3306) {
        list.push(DiscoveredDb {
            name: "Local MySQL".to_string(),
            driver: "mysql".to_string(),
            port: 3306,
            source: "Homebrew / Local".to_string(),
            data_dir: mysql_data_dir(3306),
        });
    }

    if port_open(6379) {
        list.push(DiscoveredDb {
            name: "Local Redis".to_string(),
            driver: "redis".to_string(),
            port: 6379,
            source: "Homebrew / Local".to_string(),
            data_dir: homebrew_db_dir("redis"),
        });
    }

    if port_open(27017) {
        list.push(DiscoveredDb {
            name: "Local MongoDB".to_string(),
            driver: "mongodb".to_string(),
            port: 27017,
            source: "Homebrew / Local".to_string(),
            data_dir: mongo_data_dir(27017),
        });
    }

    list
}

fn homebrew_db_dir(formula: &str) -> Option<String> {
    // Check Homebrew var/ dirs for standard db paths
    for prefix in ["/opt/homebrew/var", "/usr/local/var"] {
        let path = std::path::Path::new(prefix).join(formula);
        if path.exists() {
            return Some(path.to_string_lossy().to_string());
        }
        let postgres_path = std::path::Path::new(prefix).join("postgres");
        if formula.starts_with("postgres") && postgres_path.exists() {
            return Some(postgres_path.to_string_lossy().to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_space_separated_flag() {
        let args =
            "/opt/homebrew/opt/postgresql@16/bin/postgres -D /opt/homebrew/var/postgresql@16";
        assert_eq!(
            extract_flag_value(args, "-D"),
            Some("/opt/homebrew/var/postgresql@16".to_string())
        );
    }

    #[test]
    fn extracts_equals_separated_flag() {
        let args =
            "/opt/homebrew/opt/mysql/bin/mysqld --datadir=/opt/homebrew/var/mysql --port=3306";
        assert_eq!(
            extract_flag_value(args, "--datadir"),
            Some("/opt/homebrew/var/mysql".to_string())
        );
    }

    #[test]
    fn missing_flag_returns_none() {
        assert_eq!(extract_flag_value("mongod --port 27017", "--dbpath"), None);
    }

    #[test]
    fn flag_at_end_with_no_value_returns_none() {
        assert_eq!(extract_flag_value("postgres -D", "-D"), None);
    }
}
