use crate::error::{AppError, AppResult};
use crate::services::remote::ssh::{self, SshTarget};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub modified_epoch: u64,
    pub permissions: String,
    pub is_secret: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFileContent {
    pub path: String,
    pub content: String,
    pub size_bytes: u64,
    pub is_secret: bool,
    pub is_masked: bool,
}

pub fn is_secret_file(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.starts_with(".env")
        || lower.ends_with(".pem")
        || lower.ends_with(".key")
        || lower.starts_with("id_rsa")
        || lower.starts_with("id_ed25519")
        || lower.starts_with("id_ecdsa")
}

use crate::core::validate::RemotePath;

pub fn validate_remote_path(path: &str) -> AppResult<()> {
    RemotePath::try_from(path).map(|_| ())
}

pub fn list_directory(target: &SshTarget, dir_path: &str) -> AppResult<Vec<RemoteFileEntry>> {
    let valid_path = RemotePath::try_from(dir_path)?;
    // Try ls with standard Linux --time-style=+%s; if unsupported (e.g. BSD/macOS), fallback to plain ls -la
    let out = match ssh::exec(
        target,
        &["ls", "-la", "--time-style=+%s", "--", valid_path.as_str()],
        None,
        Duration::from_secs(15),
    ) {
        Ok(o) if o.status.success() => o,
        _ => ssh::exec(
            target,
            &["ls", "-la", "--", valid_path.as_str()],
            None,
            Duration::from_secs(15),
        )?,
    };

    if !out.status.success() {
        return Err(AppError::Shell(
            String::from_utf8_lossy(&out.stderr).to_string(),
        ));
    }

    let text = String::from_utf8_lossy(&out.stdout);
    Ok(parse_ls_output(&text, valid_path.as_str()))
}

pub fn parse_ls_output(output: &str, parent_dir: &str) -> Vec<RemoteFileEntry> {
    let mut entries = Vec::new();
    let base = if parent_dir.ends_with('/') {
        parent_dir.to_string()
    } else {
        format!("{parent_dir}/")
    };

    for line in output.lines().map(str::trim) {
        if line.starts_with("total ") || line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 7 {
            continue;
        }

        let permissions = parts[0].to_string();
        let is_dir = permissions.starts_with('d');
        let size_bytes = parts[4].parse::<u64>().unwrap_or(0);

        let (modified_epoch, name) = if let Ok(epoch) = parts[5].parse::<u64>() {
            let n = parts[6..].join(" ");
            (epoch, n)
        } else if parts.len() >= 9 {
            let n = parts[8..].join(" ");
            (0, n)
        } else {
            continue;
        };

        if name == "." || name == ".." {
            continue;
        }

        let is_secret = is_secret_file(&name);
        let path = format!("{base}{name}");

        entries.push(RemoteFileEntry {
            name,
            path,
            is_dir,
            size_bytes,
            modified_epoch,
            permissions,
            is_secret,
        });
    }

    entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.cmp(&b.name)
        }
    });

    entries
}

pub fn read_file(
    target: &SshTarget,
    file_path: &str,
    reveal: bool,
) -> AppResult<RemoteFileContent> {
    let valid_path = RemotePath::try_from(file_path)?;
    let filename = valid_path
        .as_str()
        .rsplit('/')
        .next()
        .unwrap_or(valid_path.as_str());
    let is_secret = is_secret_file(filename);

    // Limit to 1 MB via argv head
    let out = ssh::exec(
        target,
        &["head", "-c", "1048576", "--", valid_path.as_str()],
        None,
        Duration::from_secs(15),
    )?;

    if !out.status.success() {
        return Err(AppError::Shell(
            String::from_utf8_lossy(&out.stderr).to_string(),
        ));
    }

    let raw = String::from_utf8_lossy(&out.stdout).to_string();
    let size_bytes = out.stdout.len() as u64;

    if is_secret && !reveal {
        let masked: String = raw
            .lines()
            .map(|l| {
                if let Some(idx) = l.find('=') {
                    format!("{}=••••••••", &l[..idx])
                } else {
                    "••••••••".to_string()
                }
            })
            .collect::<Vec<_>>()
            .join(
                "
",
            );

        Ok(RemoteFileContent {
            path: file_path.to_string(),
            content: masked,
            size_bytes,
            is_secret: true,
            is_masked: true,
        })
    } else {
        Ok(RemoteFileContent {
            path: file_path.to_string(),
            content: raw,
            size_bytes,
            is_secret,
            is_masked: false,
        })
    }
}

pub fn check_remote_exists(target: &SshTarget, remote_path: &str) -> AppResult<bool> {
    let valid_path = RemotePath::try_from(remote_path)?;
    let out = ssh::exec(
        target,
        &["test", "-e", valid_path.as_str()],
        None,
        Duration::from_secs(10),
    )?;
    Ok(out.status.success())
}

pub fn build_scp_download_args(
    target: &SshTarget,
    remote_path: &RemotePath,
    local_dest: &std::path::Path,
    control_dir: &std::path::Path,
) -> Vec<String> {
    let (opts, dest_spec) = target.scp_parts();
    let mut args = ssh::base_args();
    for kv in ["BatchMode=yes", "ConnectTimeout=8"] {
        args.extend(["-o".to_string(), kv.to_string()]);
    }
    args.extend(ssh::control_opts(control_dir));
    args.extend(opts);
    let remote_spec = format!("{dest_spec}:{}", remote_path.as_str());
    args.push(remote_spec);
    args.push(local_dest.to_string_lossy().to_string());
    args
}

pub fn build_scp_upload_args(
    target: &SshTarget,
    local_src: &std::path::Path,
    remote_path: &RemotePath,
    control_dir: &std::path::Path,
) -> Vec<String> {
    let (opts, dest_spec) = target.scp_parts();
    let mut args = ssh::base_args();
    for kv in ["BatchMode=yes", "ConnectTimeout=8"] {
        args.extend(["-o".to_string(), kv.to_string()]);
    }
    args.extend(ssh::control_opts(control_dir));
    args.extend(opts);
    args.push(local_src.to_string_lossy().to_string());
    let remote_spec = format!("{dest_spec}:{}", remote_path.as_str());
    args.push(remote_spec);
    args
}

pub fn download_file(
    target: &SshTarget,
    remote_path: &str,
    local_dest: &std::path::Path,
) -> AppResult<()> {
    let valid_remote = RemotePath::try_from(remote_path)?;
    let parent = local_dest
        .parent()
        .ok_or_else(|| AppError::Forbidden("Invalid local destination directory".into()))?;
    if !parent.exists() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::Io(format!("Failed to create local destination folder: {e}")))?;
    }

    let control_dir = ssh::control_dir()?;
    let args = build_scp_download_args(target, &valid_remote, local_dest, &control_dir);

    let out = std::process::Command::new(ssh::SCP_BIN)
        .args(&args)
        .output()
        .map_err(|e| AppError::Io(format!("Failed to run scp download: {e}")))?;

    if !out.status.success() {
        return Err(AppError::Shell(
            String::from_utf8_lossy(&out.stderr).to_string(),
        ));
    }
    Ok(())
}

pub fn upload_file(
    target: &SshTarget,
    local_src: &std::path::Path,
    remote_path: &str,
    overwrite: bool,
) -> AppResult<()> {
    if !local_src.exists() || !local_src.is_file() {
        return Err(AppError::NotFound(
            "Local file does not exist or is not a file".into(),
        ));
    }
    let valid_remote = RemotePath::try_from(remote_path)?;

    if !overwrite && check_remote_exists(target, valid_remote.as_str())? {
        return Err(AppError::Conflict(format!(
            "Remote file '{}' already exists. Pass overwrite=true to overwrite.",
            valid_remote.as_str()
        )));
    }

    let control_dir = ssh::control_dir()?;
    let args = build_scp_upload_args(target, local_src, &valid_remote, &control_dir);

    let out = std::process::Command::new(ssh::SCP_BIN)
        .args(&args)
        .output()
        .map_err(|e| AppError::Io(format!("Failed to run scp upload: {e}")))?;

    if !out.status.success() {
        return Err(AppError::Shell(
            String::from_utf8_lossy(&out.stderr).to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_secret_detection() {
        assert!(is_secret_file(".env"));
        assert!(is_secret_file(".env.production"));
        assert!(is_secret_file("server.key"));
        assert!(is_secret_file("cert.pem"));
        assert!(is_secret_file("id_ed25519"));
        assert!(!is_secret_file("server.js"));
        assert!(!is_secret_file("docker-compose.yml"));
    }

    #[test]
    fn test_path_validation() {
        assert!(validate_remote_path("/var/log").is_ok());
        assert!(validate_remote_path("~/app").is_ok());
        assert!(validate_remote_path("/var/log/my folder/file.txt").is_ok());
        assert!(validate_remote_path("/etc/../root").is_err());
        assert!(validate_remote_path("").is_err());
        assert!(validate_remote_path("/etc/hosts; rm -rf").is_err());
        assert!(validate_remote_path("/var/`id`").is_err());
    }

    #[test]
    fn test_parse_ls_output() {
        let fixture = r#"
total 16
drwxr-xr-x 4 ubuntu ubuntu 4096 1700000000 .
drwxr-xr-x 8 ubuntu ubuntu 4096 1699999000 ..
-rw-r--r-- 1 ubuntu ubuntu  123 1700000100 .env.prod
-rw-r--r-- 1 ubuntu ubuntu  456 1700000200 config.json
drwxr-xr-x 2 ubuntu ubuntu 4096 1700000300 src
"#;
        let entries = parse_ls_output(fixture, "/app");
        assert_eq!(entries.len(), 3);
        // Directories sorted first
        assert_eq!(entries[0].name, "src");
        assert!(entries[0].is_dir);
        assert_eq!(entries[1].name, ".env.prod");
        assert!(entries[1].is_secret);
        assert_eq!(entries[2].name, "config.json");
        assert!(!entries[2].is_secret);
    }

    #[test]
    fn test_scp_args_construction() {
        let target = SshTarget::alias("prod-box");
        let remote_path = RemotePath::try_from("/var/log/nginx.log").unwrap();
        let local_path = std::path::Path::new("/tmp/nginx.log");
        let control_dir = std::path::Path::new("/tmp/nxc-501");

        let dl_args = build_scp_download_args(&target, &remote_path, local_path, control_dir);
        assert!(dl_args.contains(&"-o".to_string()));
        assert!(dl_args.contains(&"BatchMode=yes".to_string()));
        assert_eq!(dl_args.last().unwrap(), "/tmp/nginx.log");
        assert_eq!(dl_args[dl_args.len() - 2], "prod-box:/var/log/nginx.log");

        let up_args = build_scp_upload_args(&target, local_path, &remote_path, control_dir);
        assert_eq!(up_args[up_args.len() - 2], "/tmp/nginx.log");
        assert_eq!(up_args.last().unwrap(), "prod-box:/var/log/nginx.log");
    }
}
