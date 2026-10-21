// One unified, audit-enforced network allow-list for Stackroost (A-07).
// Every outbound destination is explicitly declared, associated with a module,
// and exposed in Settings -> Privacy and the README.

use crate::core::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NetDestination {
    pub id: String,
    pub host_pattern: String,
    pub purpose: String,
    pub module: String,
    pub outbound: bool,
    /// The user supplies these (their servers, URLs, domains); listed so the
    /// Privacy view is complete, never matched by `is_destination_allowed`.
    pub user_configured: bool,
}

pub fn declared_destinations() -> Vec<NetDestination> {
    vec![
        NetDestination {
            id: "github_api".into(),
            host_pattern: "api.github.com".into(),
            purpose: "Check for new releases and updater manifest".into(),
            module: "updater".into(),
            outbound: true,
            user_configured: false,
        },
        NetDestination {
            id: "github_web".into(),
            host_pattern: "github.com".into(),
            purpose: "Fallback release download links and changelog".into(),
            module: "updater".into(),
            outbound: true,
            user_configured: false,
        },
        NetDestination {
            id: "domains_rdap".into(),
            host_pattern: "rdap.org".into(),
            purpose: "Query domain registration and expiration via ICANN RDAP".into(),
            module: "domains".into(),
            outbound: true,
            user_configured: false,
        },
        NetDestination {
            id: "cloudflare_dns".into(),
            host_pattern: "1.1.1.1".into(),
            purpose: "Query public DNS propagation records via Cloudflare DNS".into(),
            module: "domains".into(),
            outbound: true,
            user_configured: false,
        },
        NetDestination {
            id: "google_dns".into(),
            host_pattern: "8.8.8.8".into(),
            purpose: "Query public DNS propagation records via Google DNS".into(),
            module: "domains".into(),
            outbound: true,
            user_configured: false,
        },
        NetDestination {
            id: "quad9_dns".into(),
            host_pattern: "9.9.9.9".into(),
            purpose: "Query public DNS propagation records via Quad9 DNS".into(),
            module: "domains".into(),
            outbound: true,
            user_configured: false,
        },
        NetDestination {
            id: "aws_endpoints".into(),
            host_pattern: "*.amazonaws.com".into(),
            purpose: "Communicate with configured AWS regions for EC2 and Cost Explorer".into(),
            module: "cloud".into(),
            outbound: true,
            user_configured: false,
        },
        NetDestination {
            id: "ollama_local".into(),
            host_pattern: "127.0.0.1:11434".into(),
            purpose: "Local Ollama daemon on this Mac (no outbound traffic leaves machine)".into(),
            module: "ai".into(),
            outbound: false,
            user_configured: false,
        },
    ]
    .into_iter()
    .chain([
        user_dest(
            "ssh_hosts",
            "Servers you add",
            "SSH to hosts you imported or added, with your own keys",
            "remote",
        ),
        user_dest(
            "uptime_urls",
            "URLs you monitor",
            "HTTP checks of the uptime monitors you configure",
            "domains",
        ),
        user_dest(
            "domain_checks",
            "Domains you check",
            "TLS certificate and DNS lookups for domains you enter",
            "domains",
        ),
    ])
    .collect()
}

fn user_dest(id: &str, host: &str, purpose: &str, module: &str) -> NetDestination {
    NetDestination {
        id: id.into(),
        host_pattern: host.into(),
        purpose: purpose.into(),
        module: module.into(),
        outbound: true,
        user_configured: true,
    }
}

/// Verify if a target hostname or address matches an allowed destination.
pub fn is_destination_allowed(target: &str) -> bool {
    let lower = target.to_lowercase();
    for d in declared_destinations()
        .into_iter()
        .filter(|d| !d.user_configured)
    {
        if d.host_pattern.starts_with("*.") {
            let suffix = &d.host_pattern[1..]; // e.g. ".amazonaws.com"
            if lower.ends_with(suffix) || lower == d.host_pattern[2..] {
                return true;
            }
        } else if lower == d.host_pattern.to_lowercase() {
            return true;
        }
    }
    // Loopback localhost is always allowed locally
    lower == "localhost"
        || lower == "127.0.0.1"
        || lower.starts_with("127.0.0.1:")
        || lower.starts_with("localhost:")
}

/// Enforce that target is on the network allow-list before making an outbound call.
pub fn check_outbound_allowed(target: &str) -> AppResult<()> {
    if is_destination_allowed(target) {
        Ok(())
    } else {
        Err(AppError::Forbidden(format!(
            "Outbound connection to '{target}' is not in the declared network allow-list."
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_declared_destinations() {
        let dests = declared_destinations();
        assert!(!dests.is_empty());
        assert!(dests.iter().any(|d| d.id == "github_api"));
        assert!(dests.iter().any(|d| d.id == "domains_rdap"));
    }

    #[test]
    fn test_is_destination_allowed() {
        assert!(is_destination_allowed("api.github.com"));
        assert!(is_destination_allowed("rdap.org"));
        assert!(is_destination_allowed("1.1.1.1"));
        assert!(is_destination_allowed("ce.us-east-1.amazonaws.com"));
        assert!(is_destination_allowed("127.0.0.1:11434"));
        assert!(is_destination_allowed("localhost:8080"));

        // Unauthorized destinations rejected
        assert!(!is_destination_allowed("evil-telemetry.com"));
        assert!(!is_destination_allowed("tracking.example.org"));
        // User-configured entries are descriptive only, never wildcards.
        assert!(!is_destination_allowed("servers you add"));
    }

    #[test]
    fn test_check_outbound_allowed() {
        assert!(check_outbound_allowed("api.github.com").is_ok());
        assert!(check_outbound_allowed("unauthorized-tracker.com").is_err());
    }
}
