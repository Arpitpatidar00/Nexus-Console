use crate::error::AppResult;
use crate::remote::ssh::{self, SshTarget};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionItem {
    pub name: String,
    pub local_version: Option<String>,
    pub remote_versions: HashMap<String, Option<String>>,
    pub matches: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvKeyItem {
    pub key: String,
    pub in_local: bool,
    pub in_remote: HashMap<String, bool>,
    pub same_value_warning: bool,
    pub shared_environments: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftItem {
    pub service: String,
    pub local_image: Option<String>,
    pub remote_images: HashMap<String, Option<String>>,
    pub in_sync: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParityReport {
    pub versions: Vec<VersionItem>,
    pub env_keys: Vec<EnvKeyItem>,
    pub drift: Vec<DriftItem>,
}

pub fn generate_salt() -> String {
    let mut bytes = [0u8; 32];
    if let Ok(mut f) = std::fs::File::open("/dev/urandom") {
        let _ = f.read_exact(&mut bytes);
    } else {
        let t = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(42);
        for (i, b) in bytes.iter_mut().enumerate() {
            *b = ((t >> (i % 8)) & 0xff) as u8;
        }
    }
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

pub fn parse_env_hmac_output(output: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some((k, v)) = line.split_once(':') {
            map.insert(k.trim().to_string(), v.trim().to_string());
        }
    }
    map
}

pub fn compare_env_keys(
    local_keys: &HashMap<String, String>,
    remote_keys: &HashMap<String, HashMap<String, String>>,
    host_envs: &HashMap<String, String>,
) -> Vec<EnvKeyItem> {
    let mut all_keys = std::collections::BTreeSet::new();
    for k in local_keys.keys() {
        all_keys.insert(k.clone());
    }
    for r in remote_keys.values() {
        for k in r.keys() {
            all_keys.insert(k.clone());
        }
    }

    let mut items = Vec::new();
    for key in all_keys {
        let in_local = local_keys.contains_key(&key);
        let mut in_remote = HashMap::new();
        let mut hmac_by_host = HashMap::new();

        if let Some(h) = local_keys.get(&key) {
            if h != "none" {
                hmac_by_host.insert("local".to_string(), h.clone());
            }
        }

        for (host_id, rmap) in remote_keys {
            let present = rmap.contains_key(&key);
            in_remote.insert(host_id.clone(), present);
            if let Some(h) = rmap.get(&key) {
                if h != "none" {
                    hmac_by_host.insert(host_id.clone(), h.clone());
                }
            }
        }

        let mut same_value_warning = false;
        let mut shared_environments = Vec::new();

        let mut groups: HashMap<&str, Vec<&str>> = HashMap::new();
        for (host_or_local, hash) in &hmac_by_host {
            groups
                .entry(hash.as_str())
                .or_default()
                .push(host_or_local.as_str());
        }

        for (_hash, members) in groups {
            if members.len() > 1 {
                let mut envs = std::collections::HashSet::new();
                for &m in &members {
                    let env_name = if m == "local" {
                        "local"
                    } else {
                        host_envs.get(m).map(|s| s.as_str()).unwrap_or("unknown")
                    };
                    envs.insert(env_name);
                }
                if envs.len() > 1 && (envs.contains("prod") || envs.contains("staging")) {
                    same_value_warning = true;
                    shared_environments = members.into_iter().map(|s| s.to_string()).collect();
                    break;
                }
            }
        }

        items.push(EnvKeyItem {
            key,
            in_local,
            in_remote,
            same_value_warning,
            shared_environments,
        });
    }

    items
}

pub fn clean_version_output(out: &str) -> Option<String> {
    let s = out.trim();
    if s.is_empty() || s.contains("not found") || s.contains("No such file") {
        None
    } else {
        Some(s.lines().next().unwrap_or("").trim().to_string())
    }
}

pub fn run_parity_audit(
    local_project_path: Option<&str>,
    hosts: &[(&str, &SshTarget, &str, &str)],
) -> AppResult<ParityReport> {
    let salt = generate_salt();

    let mut local_versions = HashMap::new();
    let version_cmds = [
        ("node", "node -v"),
        ("python3", "python3 --version"),
        ("docker", "docker --version"),
        ("compose", "docker compose version"),
        ("postgres", "psql --version"),
        ("redis", "redis-server --version"),
    ];

    for (name, cmd) in version_cmds {
        let out = std::process::Command::new("sh")
            .arg("-c")
            .arg(cmd)
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string());
        local_versions.insert(name.to_string(), out.and_then(|o| clean_version_output(&o)));
    }

    let mut local_keys = HashMap::new();
    if let Some(proj) = local_project_path {
        let env_file = Path::new(proj).join(".env");
        if env_file.exists() {
            if let Ok(content) = std::fs::read_to_string(env_file) {
                for line in content.lines() {
                    let line = line.trim();
                    if line.is_empty() || line.starts_with('#') || !line.contains('=') {
                        continue;
                    }
                    if let Some((k, _)) = line.split_once('=') {
                        local_keys.insert(k.trim().to_string(), "local_present".to_string());
                    }
                }
            }
        }
    }

    let mut remote_versions_by_name: HashMap<String, HashMap<String, Option<String>>> =
        HashMap::new();
    let mut remote_keys_by_host = HashMap::new();
    let mut host_envs = HashMap::new();

    for &(id, target, env, app_dir) in hosts {
        host_envs.insert(id.to_string(), env.to_string());

        let ver_script = "echo NODE:$(node -v 2>/dev/null); echo PYTHON:$(python3 --version 2>/dev/null); echo DOCKER:$(docker --version 2>/dev/null); echo COMPOSE:$(docker compose version 2>/dev/null); echo POSTGRES:$(psql --version 2>/dev/null); echo REDIS:$(redis-server --version 2>/dev/null)";
        if let Ok(out) = ssh::exec(
            target,
            &["sh", "-c", ver_script],
            None,
            Duration::from_secs(10),
        ) {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for line in stdout.lines() {
                if let Some((k, v)) = line.split_once(':') {
                    let cleaned = clean_version_output(v);
                    let tool = match k.trim() {
                        "NODE" => "node",
                        "PYTHON" => "python3",
                        "DOCKER" => "docker",
                        "COMPOSE" => "compose",
                        "POSTGRES" => "postgres",
                        "REDIS" => "redis",
                        _ => continue,
                    };
                    remote_versions_by_name
                        .entry(tool.to_string())
                        .or_default()
                        .insert(id.to_string(), cleaned);
                }
            }
        }

        if !app_dir.is_empty() && !app_dir.contains("..") {
            let hmac_cmd = format!(
                "python3 -c 'import hmac, hashlib, os, sys; salt = sys.argv[1].encode(); [print(f\"{{k}}:{{hmac.new(salt, v.encode(), hashlib.sha256).hexdigest()}}\") for line in open(sys.argv[2]) if line.strip() and not line.strip().startswith(\"#\") and \"=\" in line for k, v in [line.strip().split(\"=\", 1)]]' \"{salt}\" \"{app_dir}/.env\" 2>/dev/null || cat \"{app_dir}/.env\" 2>/dev/null | grep -v '^\\s*#' | grep '=' | cut -d= -f1 | sed 's/$/:none/'"
            );
            if let Ok(out) = ssh::exec(
                target,
                &["sh", "-c", &hmac_cmd],
                None,
                Duration::from_secs(15),
            ) {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let map = parse_env_hmac_output(&stdout);
                remote_keys_by_host.insert(id.to_string(), map);
            }
        }
    }

    let mut versions = Vec::new();
    for (name, _) in version_cmds {
        let loc = local_versions.get(name).cloned().flatten();
        let remotes = remote_versions_by_name.remove(name).unwrap_or_default();
        let mut matches = true;
        if let Some(ref l) = loc {
            for rv in remotes.values() {
                if rv.as_ref() != Some(l) {
                    matches = false;
                    break;
                }
            }
        }
        versions.push(VersionItem {
            name: name.to_string(),
            local_version: loc,
            remote_versions: remotes,
            matches,
        });
    }

    let env_keys = compare_env_keys(&local_keys, &remote_keys_by_host, &host_envs);

    Ok(ParityReport {
        versions,
        env_keys,
        drift: Vec::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_env_hmac_output() {
        let raw = "PORT:abc123\nDATABASE_URL:def456\nSTRIPE_KEY:789xyz\n";
        let map = parse_env_hmac_output(raw);
        assert_eq!(map.get("PORT").map(|s| s.as_str()), Some("abc123"));
        assert_eq!(map.get("DATABASE_URL").map(|s| s.as_str()), Some("def456"));
        assert_eq!(map.get("STRIPE_KEY").map(|s| s.as_str()), Some("789xyz"));
    }

    #[test]
    fn test_compare_env_keys_detects_same_secret_leak() {
        let mut local = HashMap::new();
        local.insert("STRIPE_KEY".into(), "hash_secret".into());

        let mut remote = HashMap::new();
        let mut h1 = HashMap::new();
        h1.insert("STRIPE_KEY".into(), "hash_secret".into());
        remote.insert("host_prod".into(), h1);

        let mut h2 = HashMap::new();
        h2.insert("STRIPE_KEY".into(), "hash_secret".into());
        remote.insert("host_staging".into(), h2);

        let mut host_envs = HashMap::new();
        host_envs.insert("host_prod".into(), "prod".into());
        host_envs.insert("host_staging".into(), "staging".into());

        let res = compare_env_keys(&local, &remote, &host_envs);
        let stripe = res.iter().find(|i| i.key == "STRIPE_KEY").unwrap();
        assert!(
            stripe.same_value_warning,
            "should warn that staging uses prod secret"
        );
    }

    #[test]
    fn test_clean_version_output() {
        assert_eq!(clean_version_output("v20.10.0\n"), Some("v20.10.0".into()));
        assert_eq!(clean_version_output("bash: node: command not found"), None);
    }
}
