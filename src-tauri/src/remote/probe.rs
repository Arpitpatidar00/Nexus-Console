// One round trip per refresh: the constant probe.sh piped to `sh -s`, its
// sections parsed into a HostSnapshot (docs/remote/PLAN.md §4.5, §4.6).

use super::parse::{self, disk, docker, journal, mem, pm2, ports, system, systemd, Section};
use super::ssh::{self, SshTarget};
use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::time::Duration;

pub const PROBE_SH: &str = include_str!("probe.sh");
const PROBE_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostSnapshot {
    pub captured_at: u64,
    pub probe_ms: u64,
    pub system: system::SystemInfo,
    pub cpu: system::CpuInfo,
    pub memory: mem::MemoryInfo,
    pub disks: Vec<disk::Disk>,
    pub docker: docker::DockerInfo,
    pub containers: Vec<docker::Container>,
    pub compose_projects: Vec<docker::ComposeProject>,
    pub services: Vec<systemd::Unit>,
    pub failed_units: Vec<systemd::Unit>,
    /// `None` when PM2 isn't installed.
    pub pm2: Option<Vec<pm2::Pm2App>>,
    pub ports: Vec<ports::Port>,
    pub recent_errors: Vec<String>,
    pub oom_kills_24h: Option<u32>,
    /// What the snapshot couldn't see, in plain words.
    pub warnings: Vec<String>,
}

/// Run the probe on a host. Blocking; the caller holds the host's lock.
pub fn run(target: &SshTarget) -> AppResult<HostSnapshot> {
    // `sh -s` alone, not `LC_ALL=C sh -s`: the remote login shell parses this
    // line, and fish/csh reject the VAR=value prefix. probe.sh sets LC_ALL.
    let out = ssh::exec(
        target,
        &["sh", "-s"],
        Some(PROBE_SH.as_bytes()),
        PROBE_TIMEOUT,
    )?;
    let text = String::from_utf8_lossy(&out.stdout);
    build(
        &text,
        out.elapsed.as_millis() as u64,
        crate::doctor::claude::now_epoch(),
    )
}

/// Human copy for each section that came back absent or errored. Tools whose
/// absence is itself the answer (docker, compose, pm2) have no entry here:
/// the snapshot already says so.
fn describe(name: &str, sec: Option<&Section>) -> Option<String> {
    let what = match name {
        "disk" => "Disk usage",
        "containers" | "inspect" | "stats" => "Container details",
        "compose" => "Compose projects",
        "units" | "failed" => "Services",
        "pm2" => "PM2 apps",
        "ports" => "Listening ports",
        "oom" | "errors" => "Recent errors",
        _ => return None,
    };
    match sec? {
        Section::Ok(_) => None,
        Section::Error(line) => Some(format!("{what} unavailable: {line}")),
        Section::Absent => match name {
            "units" | "failed" => {
                Some("systemd isn't running here, so services aren't listed.".into())
            }
            "ports" => Some("`ss` isn't installed, so listening ports aren't listed.".into()),
            "oom" | "errors" => Some("No systemd journal, so recent errors aren't shown.".into()),
            _ => None,
        },
    }
}

pub fn build(out: &str, probe_ms: u64, captured_at: u64) -> AppResult<HostSnapshot> {
    let s = parse::split_sections(out);
    if s.ok("meta").is_none() {
        let first = out
            .lines()
            .find(|l| !l.trim().is_empty())
            .unwrap_or("no output");
        return Err(AppError::Parse(format!(
            "The server's shell didn't run the probe: {first}"
        )));
    }

    let mut warnings: Vec<String> = Vec::new();
    for name in [
        "disk",
        "containers",
        "inspect",
        "stats",
        "compose",
        "units",
        "failed",
        "pm2",
        "ports",
        "oom",
        "errors",
    ] {
        if let Some(w) = describe(name, s.get(name)) {
            if !warnings.contains(&w) {
                warnings.push(w);
            }
        }
    }
    if !s.complete {
        warnings.push("The probe was cut off, so some sections are missing.".into());
    }

    let pm2 = match s.get("pm2") {
        Some(Section::Ok(body)) => {
            let apps = pm2::parse_pm2(body);
            if apps.is_none() {
                warnings.push("PM2 apps unavailable: `pm2 jlist` didn't return JSON.".into());
            }
            apps
        }
        _ => None,
    };

    Ok(HostSnapshot {
        captured_at,
        probe_ms,
        system: system::parse_system(s.ok("meta"), s.ok("uptime"), s.ok("reboot")),
        cpu: system::parse_cpu(s.ok("uptime"), s.ok("cpu")),
        memory: mem::parse_mem(s.ok("mem")),
        disks: disk::parse_disks(s.ok("disk")),
        docker: docker::parse_docker(s.get("docker")),
        containers: docker::parse_containers(s.ok("containers"), s.ok("inspect"), s.ok("stats")),
        compose_projects: docker::parse_compose(s.ok("compose")),
        services: systemd::parse_units(s.ok("units")),
        failed_units: systemd::parse_units(s.ok("failed")),
        pm2,
        ports: ports::parse_ports(s.ok("ports")),
        recent_errors: journal::parse_errors(s.ok("errors")),
        oom_kills_24h: journal::parse_oom(s.ok("oom")),
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::docker::DockerState;
    use super::*;

    fn fixture(case: &str) -> HostSnapshot {
        let path = format!(
            "{}/../fixtures/remote/{case}/probe.txt",
            env!("CARGO_MANIFEST_DIR")
        );
        let raw = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{path}: {e}"));
        build(&raw, 0, 0).unwrap()
    }

    fn container<'a>(s: &'a HostSnapshot, name: &str) -> &'a docker::Container {
        s.containers
            .iter()
            .find(|c| c.name == name)
            .unwrap_or_else(|| panic!("no container {name}"))
    }

    #[test]
    fn every_fixture_parses_completely() {
        for case in [
            "ubuntu-24.04-docker",
            "ubuntu-22.04-no-docker",
            "debian-12-docker-no-permission",
            "amazon-linux-2023-docker-pm2",
            "alpine-no-systemd",
            "container-restarting-unhealthy",
            "disk-96pct",
        ] {
            let s = fixture(case);
            assert!(!s.system.hostname.is_empty(), "{case}: hostname");
            assert!(!s.system.os.is_empty(), "{case}: os");
            assert!(!s.system.kernel.is_empty(), "{case}: kernel");
            assert!(s.cpu.cores > 0, "{case}: cores");
            assert!(s.cpu.usage_pct.is_some(), "{case}: cpu usage");
            assert!(
                s.memory.total_bytes > s.memory.available_bytes,
                "{case}: memory"
            );
            assert!(s.system.uptime_secs > 0, "{case}: uptime");
            assert!(!s.disks.is_empty(), "{case}: disks");
            assert!(
                !s.warnings.iter().any(|w| w.contains("cut off")),
                "{case}: complete"
            );
        }
    }

    #[test]
    fn ubuntu_24_04_docker() {
        let s = fixture("ubuntu-24.04-docker");
        assert_eq!(s.system.hostname, "fameo-prod");
        assert!(s.system.os.starts_with("Ubuntu 24.04"));
        assert_eq!(s.system.arch, "aarch64");
        assert_eq!(s.docker.state, DockerState::Ok);
        let web = container(&s, "nexus-testbed-web-1");
        assert_eq!(web.state, "running");
        assert_eq!(web.health.as_deref(), Some("healthy"));
        assert_eq!(web.compose_project.as_deref(), Some("nexus-testbed"));
        assert_eq!(web.exit_code, None);
        assert!(web.mem_bytes.unwrap() > 1_000_000);
        assert_eq!(s.compose_projects[0].name, "nexus-testbed");
        assert!(s.services.iter().any(|u| u.unit == "cron.service"));
        assert_eq!(s.failed_units[0].unit, "report-export.service");
        assert_eq!(s.failed_units[0].description, "Nightly report export");
        assert!(s
            .recent_errors
            .iter()
            .any(|e| e.contains("report-export.service")));
        assert_eq!(s.oom_kills_24h, Some(0));
        assert_eq!(s.pm2, None);
        assert!(s.ports.iter().any(|p| p.port == 22));
        assert!(s.warnings.is_empty(), "{:?}", s.warnings);
    }

    #[test]
    fn ubuntu_22_04_no_docker() {
        let s = fixture("ubuntu-22.04-no-docker");
        assert_eq!(s.docker.state, DockerState::Absent);
        assert!(s.containers.is_empty());
        assert!(s.system.reboot_required);
        assert!(!s.services.is_empty());
        // Not in adm/systemd-journal: honest null, not a fake zero.
        assert_eq!(s.oom_kills_24h, None);
        assert!(s
            .warnings
            .iter()
            .any(|w| w.contains("no permission to read the system journal")));
    }

    #[test]
    fn debian_12_docker_no_permission() {
        let s = fixture("debian-12-docker-no-permission");
        assert_eq!(s.docker.state, DockerState::NoPermission);
        assert!(s.containers.is_empty());
        assert!(s.system.os.starts_with("Debian GNU/Linux 12"));
    }

    #[test]
    fn amazon_linux_2023_docker_pm2() {
        let s = fixture("amazon-linux-2023-docker-pm2");
        assert!(s.system.os.starts_with("Amazon Linux 2023"));
        assert_eq!(s.docker.state, DockerState::Ok);
        let apps = s.pm2.as_ref().unwrap();
        let api = apps.iter().find(|a| a.name == "api").unwrap();
        assert_eq!(api.status, "online");
        assert!(api.mem_bytes > 0);
        let worker = apps.iter().find(|a| a.name == "worker").unwrap();
        assert_eq!(worker.status, "errored");
        assert!(s.ports.iter().any(|p| p.port == 3000));
        assert!(s
            .warnings
            .iter()
            .any(|w| w.contains("systemd isn't running")));
    }

    #[test]
    fn alpine_no_systemd() {
        let s = fixture("alpine-no-systemd");
        assert!(s.system.os.starts_with("Alpine Linux"));
        assert_eq!(s.docker.state, DockerState::Absent);
        assert!(s.services.is_empty());
        assert_eq!(s.pm2, None);
        assert!(s.ports.is_empty());
        assert_eq!(s.oom_kills_24h, None);
        assert!(s.warnings.iter().any(|w| w.contains("systemd")));
        assert!(s.warnings.iter().any(|w| w.contains("`ss`")));
        assert!(s.warnings.iter().any(|w| w.contains("journal")));
    }

    #[test]
    fn container_restarting_unhealthy() {
        let s = fixture("container-restarting-unhealthy");
        let crashy = container(&s, "nexus-testbed-crashy-1");
        assert_eq!(crashy.state, "restarting");
        assert_eq!(crashy.restart_policy.as_deref(), Some("unless-stopped"));
        assert!(crashy.restart_count >= 1);
        assert_eq!(crashy.exit_code, Some(1));
        assert_eq!(crashy.mem_bytes, None);
        let sick = container(&s, "nexus-testbed-sick-1");
        assert_eq!(sick.health.as_deref(), Some("unhealthy"));
        assert_eq!(sick.restart_policy.as_deref(), Some("no"));
        let web = container(&s, "nexus-testbed-web-1");
        assert_eq!(web.health.as_deref(), Some("healthy"));
        assert!(s.compose_projects[0].status.contains("restarting"));
    }

    #[test]
    fn disk_96pct() {
        let s = fixture("disk-96pct");
        let d = s
            .disks
            .iter()
            .max_by_key(|d| d.used_bytes * 100 / d.total_bytes)
            .unwrap();
        assert_eq!(d.used_bytes * 100 / d.total_bytes, 96);
    }

    #[test]
    fn output_without_a_probe_is_a_parse_error() {
        let e = build("fish: Unknown command: sh\n", 0, 0).unwrap_err();
        assert!(matches!(e, AppError::Parse(m) if m.contains("fish: Unknown command")));
    }

    #[test]
    fn truncated_output_still_builds_with_a_warning() {
        let raw = std::fs::read_to_string(format!(
            "{}/../fixtures/remote/ubuntu-24.04-docker/probe.txt",
            env!("CARGO_MANIFEST_DIR")
        ))
        .unwrap();
        let cut = &raw[..raw.find("@@NX:docker@@").unwrap()];
        let s = build(cut, 0, 0).unwrap();
        assert!(s.cpu.cores > 0);
        assert_eq!(s.docker.state, DockerState::Absent);
        assert!(s.warnings.iter().any(|w| w.contains("cut off")));
    }

    #[test]
    fn probe_script_is_read_only() {
        let code: String = PROBE_SH
            .lines()
            .filter(|l| !l.trim_start().starts_with('#'))
            .collect::<Vec<_>>()
            .join("\n");
        for banned in [
            "sudo",
            "rm -rf",
            " > /",
            "docker rm",
            "docker stop",
            "docker restart",
            "systemctl restart",
            "systemctl start",
            "systemctl stop",
        ] {
            assert!(!code.contains(banned), "probe.sh runs {banned:?}");
        }
    }
}
