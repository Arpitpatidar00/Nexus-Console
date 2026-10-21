use crate::error::AppResult;
use crate::services::remote::ssh::{self, SshTarget};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NginxSite {
    pub name: String,
    pub server_names: Vec<String>,
    pub listen_ports: Vec<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CronJob {
    pub source: String,
    pub schedule: String,
    pub command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InspectionData {
    pub nginx_active: bool,
    pub nginx_sites: Vec<NginxSite>,
    pub cron_jobs: Vec<CronJob>,
    pub reload_guidance: String,
}

const INSPECT_SCRIPT: &str = r#"
echo "===NGINX_STATUS==="
systemctl is-active nginx 2>/dev/null || echo "inactive"
echo "===NGINX_SITES==="
for f in /etc/nginx/sites-enabled/*; do
  [ -f "$f" ] || continue
  echo "SITE:$(basename "$f")"
  grep -E "server_name|listen" "$f" 2>/dev/null || true
done
echo "===CRON_USER==="
crontab -l 2>/dev/null || true
echo "===CRON_SYSTEM==="
for f in /etc/cron.d/*; do
  [ -f "$f" ] || continue
  echo "CROND:$(basename "$f")"
  cat "$f" 2>/dev/null || true
done
"#;

pub fn inspect_host(target: &SshTarget) -> AppResult<InspectionData> {
    let out = ssh::exec(
        target,
        &["sh", "-s"],
        Some(INSPECT_SCRIPT.as_bytes()),
        Duration::from_secs(15),
    )?;
    let text = String::from_utf8_lossy(&out.stdout);
    Ok(parse_inspection(&text))
}

pub fn parse_inspection(output: &str) -> InspectionData {
    let mut nginx_active = false;
    let mut nginx_sites = Vec::new();
    let mut cron_jobs = Vec::new();

    let mut section = "";
    let mut current_site: Option<NginxSite> = None;
    let mut current_crond = "";

    for line in output.lines().map(str::trim) {
        if line == "===NGINX_STATUS===" {
            section = "status";
            continue;
        } else if line == "===NGINX_SITES===" {
            section = "sites";
            continue;
        } else if line == "===CRON_USER===" {
            if let Some(site) = current_site.take() {
                nginx_sites.push(site);
            }
            section = "cron_user";
            continue;
        } else if line == "===CRON_SYSTEM===" {
            section = "cron_system";
            continue;
        }

        match section {
            "status" => {
                if line == "active" {
                    nginx_active = true;
                }
            }
            "sites" => {
                if let Some(rest) = line.strip_prefix("SITE:") {
                    if let Some(site) = current_site.take() {
                        nginx_sites.push(site);
                    }
                    current_site = Some(NginxSite {
                        name: rest.to_string(),
                        server_names: Vec::new(),
                        listen_ports: Vec::new(),
                    });
                } else if let Some(site) = current_site.as_mut() {
                    if line.contains("server_name") {
                        let names: Vec<String> = line
                            .replace("server_name", "")
                            .replace(';', "")
                            .split_whitespace()
                            .map(str::to_string)
                            .collect();
                        site.server_names.extend(names);
                    } else if line.contains("listen") {
                        for word in line
                            .replace("listen", "")
                            .replace(';', "")
                            .split_whitespace()
                        {
                            if let Ok(port) = word.parse::<u16>() {
                                if !site.listen_ports.contains(&port) {
                                    site.listen_ports.push(port);
                                }
                            }
                        }
                    }
                }
            }
            "cron_user" => {
                if !line.is_empty() && !line.starts_with('#') {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 6 {
                        let schedule = parts[0..5].join(" ");
                        let command = parts[5..].join(" ");
                        cron_jobs.push(CronJob {
                            source: "crontab".to_string(),
                            schedule,
                            command,
                        });
                    }
                }
            }
            "cron_system" => {
                if let Some(rest) = line.strip_prefix("CROND:") {
                    current_crond = rest;
                } else if !line.is_empty() && !line.starts_with('#') {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 7 {
                        let schedule = parts[0..5].join(" ");
                        let command = parts[6..].join(" ");
                        cron_jobs.push(CronJob {
                            source: format!("/etc/cron.d/{current_crond}"),
                            schedule,
                            command,
                        });
                    }
                }
            }
            _ => {}
        }
    }

    if let Some(site) = current_site.take() {
        nginx_sites.push(site);
    }

    InspectionData {
        nginx_active,
        nginx_sites,
        cron_jobs,
        reload_guidance: "To reload Nginx after editing config, run: sudo systemctl reload nginx"
            .to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_inspection() {
        let fixture = r#"
===NGINX_STATUS===
active
===NGINX_SITES===
SITE:default
listen 80 default_server;
server_name example.com www.example.com;
SITE:api
listen 443 ssl;
server_name api.example.com;
===CRON_USER===
0 * * * * /usr/bin/python3 /app/cleanup.py
===CRON_SYSTEM===
CROND:certbot
0 12 * * * root certbot renew -q
"#;
        let data = parse_inspection(fixture);
        assert!(data.nginx_active);
        assert_eq!(data.nginx_sites.len(), 2);
        assert_eq!(data.nginx_sites[0].name, "default");
        assert_eq!(data.nginx_sites[0].listen_ports, vec![80]);
        assert_eq!(
            data.nginx_sites[0].server_names,
            vec!["example.com", "www.example.com"]
        );
        assert_eq!(data.nginx_sites[1].name, "api");
        assert_eq!(data.nginx_sites[1].listen_ports, vec![443]);
        assert_eq!(data.cron_jobs.len(), 2);
        assert_eq!(data.cron_jobs[0].source, "crontab");
        assert_eq!(data.cron_jobs[0].schedule, "0 * * * *");
        assert_eq!(data.cron_jobs[1].source, "/etc/cron.d/certbot");
    }
}
