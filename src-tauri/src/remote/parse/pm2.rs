// `pm2` section: `pm2 jlist`. The raw JSON carries every app's full
// environment (often secrets); only the fields below are ever kept.

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pm2App {
    pub name: String,
    pub status: String,
    pub restarts: u32,
    pub cpu: f64,
    pub mem_bytes: u64,
}

/// `None` when the output isn't a JSON array (pm2 sometimes prints banners
/// before it, so parsing starts at the first `[`).
pub fn parse_pm2(body: &str) -> Option<Vec<Pm2App>> {
    let start = body.find('[')?;
    let v: Value = serde_json::from_str(body[start..].trim()).ok()?;
    Some(
        v.as_array()?
            .iter()
            .map(|app| {
                let env = &app["pm2_env"];
                Pm2App {
                    name: app["name"].as_str().unwrap_or("").to_string(),
                    status: env["status"].as_str().unwrap_or("unknown").to_string(),
                    restarts: env["restart_time"].as_u64().unwrap_or(0) as u32,
                    cpu: app["monit"]["cpu"].as_f64().unwrap_or(0.0),
                    mem_bytes: app["monit"]["memory"].as_u64().unwrap_or(0),
                }
            })
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn banner_before_json_and_secrets_dropped() {
        let apps = parse_pm2(
            ">>>> In-memory PM2 is out-of-date\n[{\"name\":\"api\",\"pm2_env\":{\"status\":\"online\",\
             \"restart_time\":2,\"env\":{\"DB_PASSWORD\":\"hunter2\"}},\"monit\":{\"cpu\":1.5,\"memory\":1024}}]",
        )
        .unwrap();
        assert_eq!(apps[0].status, "online");
        assert_eq!(apps[0].restarts, 2);
        assert!(!serde_json::to_string(&apps).unwrap().contains("hunter2"));
        assert_eq!(parse_pm2("[PM2] Spawning PM2 daemon"), None);
    }
}
