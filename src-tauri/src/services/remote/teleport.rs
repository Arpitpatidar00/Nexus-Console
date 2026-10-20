use crate::error::{AppError, AppResult};
use crate::remote::ssh::{self, SshTarget};
use crate::remote::store::{Env, Host};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeleportResult {
    pub image: String,
    pub host_id: String,
    pub arch_matched: bool,
    pub message: String,
}

pub fn normalize_arch(arch: &str) -> &'static str {
    let a = arch.trim().to_lowercase();
    if a.contains("arm64") || a.contains("aarch64") {
        "arm64"
    } else if a.contains("amd64") || a.contains("x86_64") {
        "amd64"
    } else {
        "unknown"
    }
}

pub fn check_arch_compatible(local_arch: &str, remote_arch: &str) -> bool {
    let l = normalize_arch(local_arch);
    let r = normalize_arch(remote_arch);
    l == r && l != "unknown"
}

pub fn teleport_image(
    host: &Host,
    target: &SshTarget,
    image_name: &str,
) -> AppResult<TeleportResult> {
    if host.env == Env::Prod {
        return Err(AppError::InvalidName(
            "Pushing local images over SSH is forbidden on production servers. Use your image registry deploy pipeline instead.".into()
        ));
    }

    let local_arch_cmd = std::process::Command::new("docker")
        .args([
            "image",
            "inspect",
            "--format",
            "{{.Architecture}}",
            image_name,
        ])
        .output()
        .map_err(|e| AppError::Io(format!("inspect local image: {e}")))?;

    if !local_arch_cmd.status.success() {
        return Err(AppError::NotFound(format!(
            "Local docker image '{image_name}' not found. Verify it is built locally."
        )));
    }

    let local_arch = String::from_utf8_lossy(&local_arch_cmd.stdout);

    let remote_arch_out = ssh::exec(target, &["uname", "-m"], None, Duration::from_secs(10))?;
    let remote_arch = String::from_utf8_lossy(&remote_arch_out.stdout);

    if !check_arch_compatible(&local_arch, remote_arch.trim()) {
        let l_norm = normalize_arch(&local_arch);
        let r_norm = normalize_arch(remote_arch.trim());
        return Err(AppError::InvalidName(format!(
            "Architecture mismatch: Local image is '{l_norm}' but {host_label} is '{r_norm}'. Build your image with --platform linux/{r_norm} first.",
            host_label = host.label
        )));
    }

    let control_dir = ssh::control_dir()?;
    let ssh_flags = ssh::build_args(target, &control_dir, &["gzip -d | docker load"]);

    let mut save_proc = std::process::Command::new("docker")
        .args(["save", image_name])
        .stdout(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Io(format!("spawn docker save: {e}")))?;

    let mut gzip_proc = std::process::Command::new("gzip")
        .stdin(save_proc.stdout.take().unwrap())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Io(format!("spawn gzip: {e}")))?;

    let mut ssh_proc = std::process::Command::new("ssh");
    for flag in &ssh_flags {
        ssh_proc.arg(flag);
    }
    ssh_proc
        .stdin(gzip_proc.stdout.take().unwrap())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let output = ssh_proc
        .spawn()
        .map_err(|e| AppError::Io(format!("spawn ssh load: {e}")))?
        .wait_with_output()
        .map_err(|e| AppError::Io(format!("wait for ssh load: {e}")))?;

    let _ = save_proc.wait();
    let _ = gzip_proc.wait();

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Io(format!("remote docker load failed: {err}")));
    }

    Ok(TeleportResult {
        image: image_name.to_string(),
        host_id: host.id.clone(),
        arch_matched: true,
        message: format!(
            "Successfully pushed image '{image_name}' to {host_label}",
            host_label = host.label
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_arch() {
        assert_eq!(normalize_arch("arm64"), "arm64");
        assert_eq!(normalize_arch("aarch64\n"), "arm64");
        assert_eq!(normalize_arch("x86_64"), "amd64");
        assert_eq!(normalize_arch("amd64\n"), "amd64");
        assert_eq!(normalize_arch("mips"), "unknown");
    }

    #[test]
    fn test_check_arch_compatible() {
        assert!(check_arch_compatible("arm64", "aarch64"));
        assert!(check_arch_compatible("amd64", "x86_64"));
        assert!(!check_arch_compatible("arm64", "x86_64"));
        assert!(!check_arch_compatible("unknown", "unknown"));
    }
}
