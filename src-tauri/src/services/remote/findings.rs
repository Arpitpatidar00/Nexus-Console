// Rules over a HostSnapshot → issues (docs/remote/PLAN.md §4.7). Severity and
// Tag are Doctor's, so the Issues tab shares Doctor's visual language:
// critical = Red, warn = Yellow, info = Green. Guides are commands the *user*
// can run; the app never runs them.

use super::parse::docker::DockerState;
use super::probe::HostSnapshot;
use crate::doctor::{Severity, Tag};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostFinding {
    pub id: &'static str,
    pub severity: Severity,
    pub tag: Tag,
    /// The mount / container / unit / app the finding is about, if any.
    pub target: Option<String>,
    pub summary: String,
    pub explain: String,
    pub guide: Option<Vec<String>>,
}

const DISK_WARN_PCT: f64 = 85.0;
const DISK_CRIT_PCT: f64 = 95.0;
const RESTARTS_CRIT: u32 = 5;

fn f(
    id: &'static str,
    severity: Severity,
    tag: Tag,
    target: Option<&str>,
    summary: String,
    explain: &str,
) -> HostFinding {
    HostFinding {
        id,
        severity,
        tag,
        target: target.map(String::from),
        summary,
        explain: explain.to_string(),
        guide: None,
    }
}

fn gib(bytes: u64) -> String {
    format!("{:.1} GB", bytes as f64 / 1e9)
}

/// Used share the way `df` computes Capacity: reserved blocks don't count.
fn used_pct(used: u64, avail: u64) -> f64 {
    let denom = used + avail;
    if denom == 0 {
        0.0
    } else {
        used as f64 * 100.0 / denom as f64
    }
}

pub fn evaluate(s: &HostSnapshot) -> Vec<HostFinding> {
    let mut out = Vec::new();

    for d in &s.disks {
        let pct = used_pct(d.used_bytes, d.avail_bytes);
        if pct >= DISK_WARN_PCT {
            let sev = if pct >= DISK_CRIT_PCT {
                Severity::Red
            } else {
                Severity::Yellow
            };
            out.push(HostFinding {
                guide: Some(vec![
                    format!("sudo du -xh --max-depth=2 {} | sort -h | tail -20", d.mount),
                    "docker system df".into(),
                    "sudo journalctl --vacuum-size=500M".into(),
                ]),
                ..f(
                    "disk_high",
                    sev,
                    Tag::Storage,
                    Some(&d.mount),
                    format!(
                        "{} is {:.0}% full ({} free)",
                        d.mount,
                        pct.floor(),
                        gib(d.avail_bytes)
                    ),
                    "When a disk fills up, databases stop accepting writes, logs stop, and \
                     deploys fail. Find what grew before it reaches 100%.",
                )
            });
        }
    }

    let m = &s.memory;
    if m.total_bytes > 0 && (m.available_bytes as f64) < m.total_bytes as f64 * 0.10 {
        out.push(f(
            "mem_low",
            Severity::Yellow,
            Tag::Speed,
            None,
            format!(
                "Only {} of {} memory available",
                gib(m.available_bytes),
                gib(m.total_bytes)
            ),
            "Below 10% available, the kernel starts swapping or killing processes (OOM). \
             Check which containers or services use the most memory.",
        ));
    }

    if m.swap_total_bytes > 0 {
        let used = m.swap_total_bytes.saturating_sub(m.swap_free_bytes);
        if used as f64 > m.swap_total_bytes as f64 * 0.5 {
            out.push(f(
                "swap_heavy",
                Severity::Green,
                Tag::Speed,
                None,
                format!("{} of {} swap in use", gib(used), gib(m.swap_total_bytes)),
                "Heavy swap use means memory has been tight at some point. It's only a \
                 problem if the server feels slow now.",
            ));
        }
    }

    let c = &s.cpu;
    if c.cores > 0 && c.load5 > c.cores as f64 * 1.5 {
        out.push(f(
            "load_high",
            Severity::Yellow,
            Tag::Speed,
            None,
            format!("Load {:.2} on {} cores (5-min average)", c.load5, c.cores),
            "More work is queued than the CPUs can run, so requests wait. High load with \
             low CPU usage usually means processes are stuck waiting on disk or network.",
        ));
    }

    for ct in &s.containers {
        let name = ct.name.as_str();
        if ct.state == "restarting" || ct.restart_count >= RESTARTS_CRIT {
            out.push(HostFinding {
                guide: Some(vec![format!("docker logs --tail 100 {name}")]),
                ..f(
                    "container_restarting",
                    Severity::Red,
                    Tag::Info,
                    Some(name),
                    format!("{name} keeps restarting ({} restarts)", ct.restart_count),
                    "The container exits and Docker starts it again. Its last log lines \
                     usually say why.",
                )
            });
        } else if ct.state == "exited"
            && ct.exit_code.is_some_and(|c| c != 0)
            && (ct.compose_project.is_some()
                || ct.restart_policy.as_deref().is_some_and(|p| p != "no"))
        {
            out.push(HostFinding {
                guide: Some(vec![format!("docker logs --tail 100 {name}")]),
                ..f(
                    "container_exited_error",
                    Severity::Yellow,
                    Tag::Info,
                    Some(name),
                    format!(
                        "{name} exited with code {}",
                        ct.exit_code.unwrap_or_default()
                    ),
                    "This container is meant to be running (it's part of a compose project or \
                     has a restart policy) but stopped with an error.",
                )
            });
        }
        if ct.health.as_deref() == Some("unhealthy") {
            out.push(HostFinding {
                guide: Some(vec![format!(
                    "docker inspect --format '{{{{json .State.Health}}}}' {name}"
                )]),
                ..f(
                    "container_unhealthy",
                    Severity::Red,
                    Tag::Info,
                    Some(name),
                    format!("{name} is failing its healthcheck"),
                    "The container is running, but its own healthcheck says it isn't working.",
                )
            });
        }
    }

    for u in &s.failed_units {
        out.push(HostFinding {
            guide: Some(vec![
                format!("systemctl status {}", u.unit),
                format!("journalctl -u {} -n 50", u.unit),
            ]),
            ..f(
                "unit_failed",
                Severity::Yellow,
                Tag::Info,
                Some(&u.unit),
                format!("{} failed", u.unit),
                "A systemd service exited with an error and isn't running.",
            )
        });
    }

    for app in s.pm2.iter().flatten() {
        if matches!(app.status.as_str(), "errored" | "stopped") {
            out.push(HostFinding {
                guide: Some(vec![format!("pm2 logs {} --lines 50", app.name)]),
                ..f(
                    "pm2_errored",
                    Severity::Yellow,
                    Tag::Info,
                    Some(&app.name),
                    format!("PM2 app {} is {}", app.name, app.status),
                    "PM2 stopped trying to keep this app running.",
                )
            });
        }
    }

    if let Some(n) = s.oom_kills_24h.filter(|n| *n > 0) {
        out.push(f(
            "oom_recent",
            Severity::Yellow,
            Tag::Speed,
            None,
            format!("The kernel killed {n} process(es) for lack of memory in the last 24 h"),
            "When memory runs out, Linux kills the largest process to free it, often a \
             database or app server. Check the journal for which one.",
        ));
    }

    if s.system.reboot_required {
        out.push(f(
            "reboot_required",
            Severity::Green,
            Tag::Info,
            None,
            "A reboot is pending to finish installing updates".into(),
            "Usually a kernel or libc update. Security fixes in it aren't active until the \
             server restarts.",
        ));
    }

    if s.docker.state == DockerState::NoPermission {
        out.push(HostFinding {
            guide: Some(vec![
                "sudo usermod -aG docker $USER".into(),
                "Then disconnect and reconnect this server in Stackroost (group changes apply to new sessions).".into(),
            ]),
            ..f(
                "docker_no_permission",
                Severity::Green,
                Tag::Info,
                None,
                "Docker is installed, but your user can't read it".into(),
                "Your SSH user isn't in the docker group, so containers can't be listed. \
                 Membership in that group is equivalent to root on this server, so only add \
                 it if that's acceptable.",
            )
        });
    }

    out.sort_by_key(|x| x.severity as u8);
    out
}

#[cfg(test)]
mod tests {
    use super::super::parse::{disk::Disk, docker, pm2::Pm2App, systemd::Unit};
    use super::*;

    fn base() -> HostSnapshot {
        let raw = std::fs::read_to_string(format!(
            "{}/../fixtures/remote/ubuntu-24.04-docker/probe.txt",
            env!("CARGO_MANIFEST_DIR")
        ))
        .unwrap();
        let mut s = super::super::probe::build(&raw, 0, 0).unwrap();
        // A clean slate: rules are tested one at a time below.
        s.failed_units.clear();
        s.disks.clear();
        s
    }

    fn ids(s: &HostSnapshot) -> Vec<&'static str> {
        evaluate(s).into_iter().map(|f| f.id).collect()
    }

    fn disk(used_pct_x10: u64) -> Disk {
        // used + avail = 1000 units, so used/1000 is the exact percentage.
        Disk {
            mount: "/".into(),
            fs: "/dev/sda1".into(),
            total_bytes: 1_100,
            used_bytes: used_pct_x10,
            avail_bytes: 1000 - used_pct_x10,
        }
    }

    #[test]
    fn clean_host_has_no_findings() {
        assert!(evaluate(&base()).is_empty());
    }

    #[test]
    fn disk_boundaries() {
        let cases = [
            (849, None),
            (850, Some(Severity::Yellow)),
            (949, Some(Severity::Yellow)),
            (950, Some(Severity::Red)),
        ];
        for (x10, want) in cases {
            let mut s = base();
            s.disks = vec![disk(x10)];
            let got = evaluate(&s)
                .into_iter()
                .find(|f| f.id == "disk_high")
                .map(|f| f.severity);
            assert_eq!(got, want, "at {}%", x10 as f64 / 10.0);
        }
    }

    #[test]
    fn disk_96pct_fixture_is_critical() {
        let raw = std::fs::read_to_string(format!(
            "{}/../fixtures/remote/disk-96pct/probe.txt",
            env!("CARGO_MANIFEST_DIR")
        ))
        .unwrap();
        let s = super::super::probe::build(&raw, 0, 0).unwrap();
        let d = s.findings.iter().find(|f| f.id == "disk_high").unwrap();
        assert_eq!(d.severity, Severity::Red);
        assert_eq!(d.target.as_deref(), Some("/run/dind"));
        assert!(d.summary.contains("96%"), "{}", d.summary);
    }

    #[test]
    fn memory_swap_and_load_boundaries() {
        let mut s = base();
        s.memory.total_bytes = 1000;
        s.memory.available_bytes = 100; // exactly 10%: not low
        s.memory.swap_total_bytes = 1000;
        s.memory.swap_free_bytes = 500; // exactly 50% used: not heavy
        s.cpu.cores = 4;
        s.cpu.load5 = 6.0; // exactly 1.5x: not high
        assert!(ids(&s).is_empty(), "{:?}", ids(&s));

        s.memory.available_bytes = 99;
        s.memory.swap_free_bytes = 499;
        s.cpu.load5 = 6.01;
        assert_eq!(ids(&s), ["mem_low", "load_high", "swap_heavy"]);

        // No swap / unknown cores never divide into a finding.
        s.memory.swap_total_bytes = 0;
        s.cpu.cores = 0;
        assert_eq!(ids(&s), ["mem_low"]);
    }

    fn ct(
        state: &str,
        restarts: u32,
        exit: Option<i64>,
        compose: bool,
        policy: &str,
    ) -> docker::Container {
        docker::Container {
            id: "abc".into(),
            name: "api-1".into(),
            image: "api".into(),
            state: state.into(),
            status: String::new(),
            health: None,
            restart_count: restarts,
            restart_policy: Some(policy.into()),
            exit_code: exit,
            cpu_pct: None,
            mem_bytes: None,
            ports: String::new(),
            compose_project: compose.then(|| "proj".into()),
            created_at: None,
        }
    }

    #[test]
    fn container_rules() {
        let cases: &[(docker::Container, &[&str])] = &[
            (ct("running", 0, None, true, "no"), &[]),
            (
                ct("restarting", 1, Some(1), true, "always"),
                &["container_restarting"],
            ),
            (ct("running", 4, None, false, "always"), &[]),
            (
                ct("running", 5, None, false, "always"),
                &["container_restarting"],
            ),
            (
                ct("exited", 0, Some(1), true, "no"),
                &["container_exited_error"],
            ),
            (
                ct("exited", 0, Some(1), false, "on-failure"),
                &["container_exited_error"],
            ),
            // A one-off container that exited with an error is nobody's problem.
            (ct("exited", 0, Some(1), false, "no"), &[]),
            (ct("exited", 0, Some(0), true, "no"), &[]),
        ];
        for (c, want) in cases {
            let mut s = base();
            s.containers = vec![c.clone()];
            assert_eq!(
                ids(&s),
                *want,
                "{} restarts={} exit={:?}",
                c.state,
                c.restart_count,
                c.exit_code
            );
        }
        let mut s = base();
        let mut sick = ct("running", 0, None, true, "no");
        sick.health = Some("unhealthy".into());
        s.containers = vec![sick];
        assert_eq!(ids(&s), ["container_unhealthy"]);
    }

    #[test]
    fn restarting_unhealthy_fixture() {
        let raw = std::fs::read_to_string(format!(
            "{}/../fixtures/remote/container-restarting-unhealthy/probe.txt",
            env!("CARGO_MANIFEST_DIR")
        ))
        .unwrap();
        let s = super::super::probe::build(&raw, 0, 0).unwrap();
        let by_target = |id: &str| -> Vec<String> {
            s.findings
                .iter()
                .filter(|f| f.id == id)
                .filter_map(|f| f.target.clone())
                .collect()
        };
        assert_eq!(
            by_target("container_restarting"),
            ["nexus-testbed-crashy-1"]
        );
        assert_eq!(by_target("container_unhealthy"), ["nexus-testbed-sick-1"]);
        assert_eq!(by_target("unit_failed"), ["report-export.service"]);
        assert!(!s
            .findings
            .iter()
            .any(|f| f.target.as_deref() == Some("nexus-testbed-web-1")));
        // Red first.
        assert_eq!(s.findings[0].severity, Severity::Red);
    }

    #[test]
    fn units_pm2_oom_reboot_docker_permission() {
        let mut s = base();
        s.failed_units = vec![Unit {
            unit: "nginx.service".into(),
            description: String::new(),
        }];
        let app = |status: &str| Pm2App {
            name: "worker".into(),
            status: status.into(),
            restarts: 0,
            cpu: 0.0,
            mem_bytes: 0,
        };
        s.pm2 = Some(vec![app("online"), app("errored"), app("stopped")]);
        s.oom_kills_24h = Some(1);
        s.system.reboot_required = true;
        s.docker.state = DockerState::NoPermission;
        assert_eq!(
            ids(&s),
            [
                "unit_failed",
                "pm2_errored",
                "pm2_errored",
                "oom_recent",
                "reboot_required",
                "docker_no_permission"
            ]
        );
        s.oom_kills_24h = Some(0);
        assert!(!ids(&s).contains(&"oom_recent"));
    }

    #[test]
    fn fixture_findings_are_honest_about_permissions() {
        let raw = std::fs::read_to_string(format!(
            "{}/../fixtures/remote/debian-12-docker-no-permission/probe.txt",
            env!("CARGO_MANIFEST_DIR")
        ))
        .unwrap();
        let s = super::super::probe::build(&raw, 0, 0).unwrap();
        let f = s
            .findings
            .iter()
            .find(|f| f.id == "docker_no_permission")
            .unwrap();
        assert_eq!(f.severity, Severity::Green);
        assert!(f.guide.as_ref().unwrap()[0].contains("usermod -aG docker"));
    }
}
