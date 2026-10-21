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

pub fn discover_local_databases() -> Vec<DiscoveredDb> {
    let mut list = Vec::new();

    // Check Postgres (5432)
    if port_open(5432) {
        list.push(DiscoveredDb {
            name: "Local PostgreSQL".to_string(),
            driver: "postgres".to_string(),
            port: 5432,
            source: "Homebrew / Local".to_string(),
            data_dir: homebrew_db_dir("postgresql@16")
                .or_else(|| homebrew_db_dir("postgresql@15"))
                .or_else(|| homebrew_db_dir("postgresql")),
        });
    }

    // Check MySQL (3306)
    if port_open(3306) {
        list.push(DiscoveredDb {
            name: "Local MySQL".to_string(),
            driver: "mysql".to_string(),
            port: 3306,
            source: "Homebrew / Local".to_string(),
            data_dir: homebrew_db_dir("mysql"),
        });
    }

    // Check Redis (6379)
    if port_open(6379) {
        list.push(DiscoveredDb {
            name: "Local Redis".to_string(),
            driver: "redis".to_string(),
            port: 6379,
            source: "Homebrew / Local".to_string(),
            data_dir: homebrew_db_dir("redis"),
        });
    }

    // Check MongoDB (27017)
    if port_open(27017) {
        list.push(DiscoveredDb {
            name: "Local MongoDB".to_string(),
            driver: "mongodb".to_string(),
            port: 27017,
            source: "Homebrew / Local".to_string(),
            data_dir: homebrew_db_dir("mongodb-community"),
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
