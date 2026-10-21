pub mod uptime;

use crate::core::error::{AppError, AppResult};
use crate::core::validate::HostName;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::process::{Command, Stdio};
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsRecord {
    pub record_type: String,
    pub value: String,
    pub ttl: Option<u32>,
    pub raw: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsLookupResult {
    pub domain: String,
    pub records: Vec<DnsRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SslCertResult {
    pub domain: String,
    pub valid: bool,
    pub issuer: String,
    pub subject: String,
    pub not_before: String,
    pub not_after: String,
    pub days_remaining: i64,
    pub sans: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RdapResult {
    pub domain: String,
    pub registrar: Option<String>,
    pub expiration_date: Option<String>,
    pub created_date: Option<String>,
    pub updated_date: Option<String>,
    pub status: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropagationAnswer {
    pub resolver: String,
    pub resolver_name: String,
    pub records: Vec<String>,
    pub latency_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropagationResult {
    pub domain: String,
    pub record_type: String,
    pub answers: Vec<PropagationAnswer>,
}

fn sanitize_domain(domain: &str) -> AppResult<String> {
    let clean = domain
        .trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .split('/')
        .next()
        .unwrap_or(domain);
    let validated = HostName::try_from(clean)?;
    Ok(validated.into_inner())
}

pub fn lookup_dns(domain: &str, record_type: &str) -> AppResult<DnsLookupResult> {
    let clean_domain = sanitize_domain(domain)?;
    let qtype = match record_type.to_uppercase().as_str() {
        "AAAA" => "AAAA",
        "CNAME" => "CNAME",
        "MX" => "MX",
        "TXT" => "TXT",
        "NS" => "NS",
        _ => "A",
    };

    let out = Command::new("/usr/bin/dig")
        .args(["+noall", "+answer", &clean_domain, qtype])
        .output()
        .map_err(|e| AppError::Io(format!("failed to run dig: {e}")))?;

    let stdout = String::from_utf8_lossy(&out.stdout);
    let records = parse_dig_records(&stdout);

    Ok(DnsLookupResult {
        domain: clean_domain,
        records,
    })
}

pub fn parse_dig_records(stdout: &str) -> Vec<DnsRecord> {
    let mut records = Vec::new();
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with(';') {
            continue;
        }
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        // Standard dig line: example.com. 300 IN A 1.2.3.4
        if parts.len() >= 5 {
            let ttl = parts[1].parse::<u32>().ok();
            let rec_type = parts[3].to_string();
            let val = parts[4..].join(" ");
            records.push(DnsRecord {
                record_type: rec_type,
                value: val,
                ttl,
                raw: trimmed.to_string(),
            });
        }
    }
    records
}

pub fn check_ssl(domain: &str, port: u16) -> AppResult<SslCertResult> {
    let clean_domain = sanitize_domain(domain)?;
    let target = format!("{clean_domain}:{port}");

    // Connect via openssl s_client with strict argv arguments and piped stdin
    let mut s_client = Command::new("/usr/bin/openssl")
        .args([
            "s_client",
            "-connect",
            &target,
            "-servername",
            &clean_domain,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| AppError::Io(format!("failed to spawn openssl s_client: {e}")))?;

    if let Some(mut stdin) = s_client.stdin.take() {
        let _ = stdin.write_all(b"\n");
        let _ = stdin.flush();
    }

    let s_client_stdout = s_client
        .stdout
        .take()
        .ok_or_else(|| AppError::Io("failed to capture s_client stdout".into()))?;

    // Pipe s_client stdout into openssl x509 via argv
    let x509 = Command::new("/usr/bin/openssl")
        .args(["x509", "-noout", "-dates", "-issuer", "-subject", "-text"])
        .stdin(s_client_stdout)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| AppError::Io(format!("failed to spawn openssl x509: {e}")))?;

    let x509_out = x509
        .wait_with_output()
        .map_err(|e| AppError::Io(format!("error waiting for openssl x509: {e}")))?;

    let _ = s_client.wait();

    let text = String::from_utf8_lossy(&x509_out.stdout);
    Ok(parse_ssl_cert_text(&text, &clean_domain))
}

pub fn parse_ssl_cert_text(text: &str, clean_domain: &str) -> SslCertResult {
    if text.trim().is_empty() {
        return SslCertResult {
            domain: clean_domain.to_string(),
            valid: false,
            issuer: String::new(),
            subject: String::new(),
            not_before: String::new(),
            not_after: String::new(),
            days_remaining: 0,
            sans: Vec::new(),
            error: Some("Could not establish TLS connection or retrieve certificate".into()),
        };
    }

    let mut not_before = String::new();
    let mut not_after = String::new();
    let mut issuer = String::new();
    let mut subject = String::new();
    let mut sans = Vec::new();

    let mut in_san = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("notBefore=") {
            not_before = rest.trim().to_string();
        } else if let Some(rest) = trimmed.strip_prefix("notAfter=") {
            not_after = rest.trim().to_string();
        } else if let Some(rest) = trimmed.strip_prefix("issuer=") {
            issuer = rest.trim().to_string();
        } else if let Some(rest) = trimmed.strip_prefix("subject=") {
            subject = rest.trim().to_string();
        } else if trimmed.contains("X509v3 Subject Alternative Name:") {
            in_san = true;
            continue;
        }

        if in_san {
            if trimmed.starts_with("X509v3") || trimmed.is_empty() {
                in_san = false;
            } else {
                for item in trimmed.split(',') {
                    let cleaned = item.trim().trim_start_matches("DNS:").trim();
                    if !cleaned.is_empty() && !sans.contains(&cleaned.to_string()) {
                        sans.push(cleaned.to_string());
                    }
                }
                in_san = false;
            }
        }
    }

    // Pure Rust date calculation
    let days_remaining = calculate_days_remaining(&not_after);
    let valid = days_remaining > 0;

    SslCertResult {
        domain: clean_domain.to_string(),
        valid,
        issuer,
        subject,
        not_before,
        not_after,
        days_remaining,
        sans,
        error: None,
    }
}

/// Convert Howard Hinnant algorithm from civil calendar to unix epoch days.
fn days_from_civil(y: i32, m: u32, d: u32) -> i64 {
    let y = y - if m <= 2 { 1 } else { 0 };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u32;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era as i64 * 146097 + doe as i64 - 719468
}

/// Parse OpenSSL format timestamps like "May 24 12:00:00 2027 GMT" in pure Rust.
pub fn parse_openssl_date(s: &str) -> Option<i64> {
    let parts: Vec<&str> = s.split_whitespace().collect();
    if parts.len() < 4 {
        return None;
    }

    let month = match parts[0] {
        "Jan" => 1,
        "Feb" => 2,
        "Mar" => 3,
        "Apr" => 4,
        "May" => 5,
        "Jun" => 6,
        "Jul" => 7,
        "Aug" => 8,
        "Sep" => 9,
        "Oct" => 10,
        "Nov" => 11,
        "Dec" => 12,
        _ => return None,
    };

    let day: u32 = parts[1].parse().ok()?;
    let time_parts: Vec<&str> = parts[2].split(':').collect();
    if time_parts.len() < 3 {
        return None;
    }
    let hour: u32 = time_parts[0].parse().ok()?;
    let min: u32 = time_parts[1].parse().ok()?;
    let sec: u32 = time_parts[2].parse().ok()?;

    let year: i32 = parts[3].parse().ok()?;

    let days = days_from_civil(year, month, day);
    let secs = days * 86400 + (hour as i64 * 3600) + (min as i64 * 60) + (sec as i64);
    Some(secs)
}

fn calculate_days_remaining(not_after: &str) -> i64 {
    if let Some(expiry_epoch) = parse_openssl_date(not_after) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        (expiry_epoch - now) / 86400
    } else {
        0
    }
}

pub fn parse_rdap_json(text: &str, clean_domain: &str) -> RdapResult {
    if text.trim().is_empty() || text.starts_with("<!DOCTYPE") || text.contains("404 Not Found") {
        return RdapResult {
            domain: clean_domain.to_string(),
            registrar: None,
            expiration_date: None,
            created_date: None,
            updated_date: None,
            status: Vec::new(),
            error: Some("Domain RDAP record not found or lookup timed out".into()),
        };
    }

    if let Ok(val) = serde_json::from_str::<serde_json::Value>(text) {
        let mut registrar = None;
        let mut expiration_date = None;
        let mut created_date = None;
        let mut updated_date = None;
        let mut status = Vec::new();

        if let Some(statuses) = val.get("status").and_then(|s| s.as_array()) {
            for st in statuses {
                if let Some(s_str) = st.as_str() {
                    status.push(s_str.to_string());
                }
            }
        }

        if let Some(events) = val.get("events").and_then(|e| e.as_array()) {
            for ev in events {
                let action = ev.get("eventAction").and_then(|a| a.as_str()).unwrap_or("");
                let date = ev
                    .get("eventDate")
                    .and_then(|d| d.as_str())
                    .map(|d| d.to_string());
                match action {
                    "expiration" => expiration_date = date,
                    "registration" => created_date = date,
                    "last changed" => updated_date = date,
                    _ => {}
                }
            }
        }

        if let Some(entities) = val.get("entities").and_then(|e| e.as_array()) {
            for ent in entities {
                let roles = ent.get("roles").and_then(|r| r.as_array());
                let is_registrar = roles
                    .map(|r| r.iter().any(|role| role.as_str() == Some("registrar")))
                    .unwrap_or(false);
                if is_registrar {
                    if let Some(vcard) = ent
                        .get("vcardArray")
                        .and_then(|v| v.as_array())
                        .and_then(|v| v.get(1))
                        .and_then(|v| v.as_array())
                    {
                        for prop in vcard {
                            if let Some(arr) = prop.as_array() {
                                if arr.first().and_then(|s| s.as_str()) == Some("fn") {
                                    registrar =
                                        arr.get(3).and_then(|s| s.as_str()).map(|s| s.to_string());
                                }
                            }
                        }
                    }
                    if registrar.is_none() {
                        registrar = ent
                            .get("handle")
                            .and_then(|h| h.as_str())
                            .map(|s| s.to_string());
                    }
                }
            }
        }

        return RdapResult {
            domain: clean_domain.to_string(),
            registrar,
            expiration_date,
            created_date,
            updated_date,
            status,
            error: None,
        };
    }

    RdapResult {
        domain: clean_domain.to_string(),
        registrar: None,
        expiration_date: None,
        created_date: None,
        updated_date: None,
        status: Vec::new(),
        error: Some("Could not parse RDAP JSON response".into()),
    }
}

pub fn check_rdap(domain: &str) -> AppResult<RdapResult> {
    crate::core::net::check_outbound_allowed("rdap.org")?;
    let clean_domain = sanitize_domain(domain)?;
    let url = format!("https://rdap.org/domain/{clean_domain}");

    let out = crate::core::exec::run(
        "curl",
        &["-sL", "-A", "Stackroost/0.1.0", "-m", "6", &url],
        crate::core::exec::ExecOpts::default().with_timeout(std::time::Duration::from_secs(7)),
    )
    .map_err(|e| AppError::Io(format!("curl failed: {e}")))?;

    let text = String::from_utf8_lossy(&out.stdout);
    Ok(parse_rdap_json(&text, &clean_domain))
}

pub fn parse_dig_propagation_output(stdout: &str) -> Vec<String> {
    stdout
        .lines()
        .filter_map(|l| {
            let parts: Vec<&str> = l.split_whitespace().collect();
            if parts.len() >= 5 {
                Some(parts[4..].join(" "))
            } else {
                None
            }
        })
        .collect()
}

pub fn check_propagation(domain: &str, record_type: &str) -> AppResult<PropagationResult> {
    let clean_domain = sanitize_domain(domain)?;
    let qtype = match record_type.to_uppercase().as_str() {
        "AAAA" => "AAAA",
        "CNAME" => "CNAME",
        "MX" => "MX",
        "TXT" => "TXT",
        _ => "A",
    };

    let resolvers = [
        ("1.1.1.1", "Cloudflare"),
        ("8.8.8.8", "Google"),
        ("9.9.9.9", "Quad9"),
    ];

    let mut answers = Vec::new();

    for (server, name) in resolvers {
        crate::core::net::check_outbound_allowed(server)?;
        let t0 = Instant::now();
        let out = Command::new("/usr/bin/dig")
            .args([
                &format!("@{server}"),
                "+noall",
                "+answer",
                "+time=2",
                "+tries=1",
                &clean_domain,
                qtype,
            ])
            .output();

        let latency_ms = t0.elapsed().as_millis() as u64;

        let records = match out {
            Ok(o) => {
                let stdout = String::from_utf8_lossy(&o.stdout);
                parse_dig_propagation_output(&stdout)
            }
            Err(_) => Vec::new(),
        };

        answers.push(PropagationAnswer {
            resolver: server.to_string(),
            resolver_name: name.to_string(),
            records,
            latency_ms,
        });
    }

    Ok(PropagationResult {
        domain: clean_domain,
        record_type: qtype.to_string(),
        answers,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lookup_dns_format() {
        let res = lookup_dns("example.com", "A");
        assert!(res.is_ok());
        let val = res.unwrap();
        assert_eq!(val.domain, "example.com");
    }

    #[test]
    fn test_domain_injection_rejected() {
        let res = lookup_dns("example.com; id", "A");
        assert!(res.is_err());
        assert!(matches!(res.unwrap_err(), AppError::InvalidName(_)));
    }

    #[test]
    fn test_parse_openssl_date() {
        let epoch = parse_openssl_date("Dec 25 22:56:35 2026 GMT").unwrap();
        // 2026-12-25 22:56:35 UTC
        assert_eq!(epoch, 1798239395);
    }
}
