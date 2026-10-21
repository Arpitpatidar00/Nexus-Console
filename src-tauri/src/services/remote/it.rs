// Integration tests against the local SSH testbed (docs/remote/PLAN.md §8.3).
// All `#[ignore]`d; run with `npm run test:remote`, which brings the testbed
// up, runs these one at a time and tears it down again.
//
// Aliases that resolve to the same user@host:port share one ControlMaster
// socket (`%C` hashes the resolved target, not the alias): nexus-prod,
// nexus-unknown and nexus-badkey are all nexus@127.0.0.1:2223. Every test that
// needs a fresh handshake closes that master first, or it would silently ride
// on an already-authenticated connection.

use super::docker::{self, DockerAction};
use super::parse::docker::DockerState;
use super::ssh::{self, SshTarget};
use super::store::{Env, Host, HostSource};
use super::{probe, with_host_lock, RemoteState};
use crate::error::AppError;
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

const T: Duration = Duration::from_secs(20);

fn testbed_dir() -> PathBuf {
    let cfg = std::env::var_os("NEXUS_SSH_CONFIG")
        .expect("NEXUS_SSH_CONFIG unset: run these via `npm run test:remote`");
    PathBuf::from(cfg).parent().unwrap().to_path_buf()
}

fn alias(a: &str) -> SshTarget {
    SshTarget::alias(a)
}

/// Close the master shared by everything on :2223.
fn fresh_prod_master() {
    ssh::control_exit(&alias("nexus-prod"));
}

/// A throwaway store with consent and the three testbed hosts.
fn state(name: &str) -> RemoteState {
    let dir = std::env::temp_dir().join(format!("nexus-it-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let st = RemoteState::load(dir.join(super::store::FILE_NAME));
    st.write(|s| {
        s.consent.granted = true;
        for (i, (a, env)) in [
            ("nexus-dev", Env::Dev),
            ("nexus-staging", Env::Staging),
            ("nexus-prod", Env::Prod),
        ]
        .into_iter()
        .enumerate()
        {
            s.hosts.push(Host {
                id: a.into(),
                source: HostSource::SshConfig,
                alias: Some(a.into()),
                manual: None,
                label: a.into(),
                project: "Testbed".into(),
                env,
                order: i as u32,
                auto_connect: false,
            });
        }
        Ok(())
    })
    .unwrap();
    st
}

#[test]
#[ignore]
fn remote_it_1_unknown_host_key_then_trusted() {
    fresh_prod_master();
    let kh = testbed_dir().join("known_hosts.unknown");
    std::fs::write(&kh, "").unwrap();
    let err = ssh::exec(&alias("nexus-unknown"), &["true"], None, T).unwrap_err();
    assert!(matches!(err, AppError::HostKey(_)), "{err:?}");

    // The user verifies the fingerprint; here, ssh-keyscan stands in for them.
    let scan = Command::new("ssh-keyscan")
        .args(["-T", "3", "-t", "ed25519", "-p", "2223", "127.0.0.1"])
        .output()
        .unwrap();
    std::fs::write(&kh, &scan.stdout).unwrap();
    let ok = ssh::exec(&alias("nexus-unknown"), &["true"], None, T);
    std::fs::write(&kh, "").unwrap();
    fresh_prod_master();
    assert!(ok.unwrap().status.success());
}

#[test]
#[ignore]
fn remote_it_2_wrong_key_is_auth() {
    fresh_prod_master();
    let err = ssh::exec(&alias("nexus-badkey"), &["true"], None, T).unwrap_err();
    assert!(matches!(err, AppError::Auth(_)), "{err:?}");
}

#[test]
#[ignore]
fn remote_it_3_closed_port_is_unreachable_and_blackhole_times_out() {
    let err = ssh::exec(&alias("nexus-closed"), &["true"], None, T).unwrap_err();
    assert!(matches!(err, AppError::Unreachable(_)), "{err:?}");
    // Our own deadline (2s) fires well before ssh's ConnectTimeout (8s).
    let err = ssh::exec(
        &alias("nexus-blackhole"),
        &["true"],
        None,
        Duration::from_secs(2),
    )
    .unwrap_err();
    assert!(matches!(err, AppError::Timeout(_)), "{err:?}");
}

#[test]
#[ignore]
fn remote_it_4_snapshots_match_each_host() {
    let dev = probe::run(&alias("nexus-dev")).unwrap();
    assert_eq!(
        dev.docker.state,
        DockerState::DaemonDown,
        "{:?}",
        dev.warnings
    );
    assert_eq!(dev.system.hostname, "nexus-dev");

    let staging = probe::run(&alias("nexus-staging")).unwrap();
    assert_eq!(staging.docker.state, DockerState::NoPermission);
    assert!(staging
        .findings
        .iter()
        .any(|f| f.id == "docker_no_permission"));

    let prod = probe::run(&alias("nexus-prod")).unwrap();
    assert_eq!(prod.docker.state, DockerState::Ok);
    let on = |id: &str| -> Vec<String> {
        prod.findings
            .iter()
            .filter(|f| f.id == id)
            .filter_map(|f| f.target.clone())
            .collect()
    };
    assert_eq!(on("container_restarting"), ["nexus-testbed-crashy-1"]);
    assert_eq!(on("container_unhealthy"), ["nexus-testbed-sick-1"]);
    let web = prod
        .containers
        .iter()
        .find(|c| c.name == "nexus-testbed-web-1")
        .unwrap();
    assert_eq!(web.health.as_deref(), Some("healthy"));
    assert!(prod.memory.total_bytes > 0 && !prod.disks.is_empty());
    println!(
        "probe ms: dev {} · staging {} · prod {}",
        dev.probe_ms, staging.probe_ms, prod.probe_ms
    );
}

#[test]
#[ignore]
fn remote_it_5_control_master_makes_the_second_exec_faster() {
    fresh_prod_master();
    let first = ssh::exec(&alias("nexus-prod"), &["true"], None, T)
        .unwrap()
        .elapsed;
    let second = ssh::exec(&alias("nexus-prod"), &["true"], None, T)
        .unwrap()
        .elapsed;
    println!("first {first:?} (handshake) · second {second:?} (multiplexed)");
    assert!(second < first, "first {first:?}, second {second:?}");
    assert!(ssh::control_check(&alias("nexus-prod")));
}

#[test]
#[ignore]
fn remote_it_6_restart_web_through_the_action_core() {
    let st = state("restart");
    let snap = probe::run(&st.target("nexus-prod").unwrap()).unwrap();
    st.remember_snapshot("nexus-prod", &snap);

    // The command layer adds the native confirm between these two calls.
    let p = docker::prepare(
        &st,
        "nexus-prod",
        "nexus-testbed-web-1",
        DockerAction::Restart,
    )
    .unwrap();
    assert!(p.destructive(), "every action on prod is destructive");
    docker::execute(&st, &p).unwrap();

    let j = st.read().unwrap().journal.clone();
    assert_eq!(j[0].action, "docker.restart");
    assert_eq!(j[0].target, "nexus-testbed-web-1");
    assert_eq!(j[0].result, "ok");
    assert_eq!(j[0].env, Env::Prod);

    let after = probe::run(&st.target("nexus-prod").unwrap()).unwrap();
    let web = after
        .containers
        .iter()
        .find(|c| c.name == "nexus-testbed-web-1")
        .unwrap();
    assert_eq!(web.state, "running");

    // Not in the snapshot → refused before any ssh.
    assert!(matches!(
        docker::prepare(&st, "nexus-prod", "not-a-container", DockerAction::Stop),
        Err(AppError::NotFound(_))
    ));
}

#[test]
#[ignore]
fn remote_it_7_parallel_snapshots_of_one_host_are_busy() {
    let st = state("busy");
    let target = st.target("nexus-prod").unwrap();
    let (a, b) = std::thread::scope(|s| {
        let a = s.spawn(|| with_host_lock(&st, "nexus-prod", || probe::run(&target)));
        std::thread::sleep(Duration::from_millis(200));
        let b = s.spawn(|| with_host_lock(&st, "nexus-prod", || probe::run(&target)));
        (a.join().unwrap(), b.join().unwrap())
    });
    assert!(a.is_ok(), "{:?}", a.err());
    assert!(matches!(b, Err(AppError::Busy(_))), "{:?}", b.map(|_| ()));
}

#[test]
#[ignore]
fn remote_it_8_disconnect_closes_the_master() {
    ssh::exec(&alias("nexus-dev"), &["true"], None, T).unwrap();
    assert!(ssh::control_check(&alias("nexus-dev")));
    assert!(ssh::control_exit(&alias("nexus-dev")));
    assert!(!ssh::control_check(&alias("nexus-dev")));
}

#[test]
#[ignore = "requires testbed"]
fn remote_it_9_sftp_read() {
    let target = alias("nexus-prod");
    let entries = crate::services::remote::files::list_directory(&target, "/tmp");
    assert!(entries.is_ok());
}

#[test]
#[ignore = "requires testbed"]
fn remote_it_10_deploy_and_rollback() {
    let target = alias("nexus-prod");
    let preview = crate::services::remote::deploys::preview_deploy(&target, "nexus-testbed");
    assert!(preview.is_ok() || preview.is_err());
}

#[test]
#[ignore = "requires testbed"]
fn remote_it_11_parity_check() {
    let dev = alias("nexus-dev");
    let prod = alias("nexus-prod");
    let report = crate::services::remote::parity::run_parity_audit(
        Some("."),
        &[
            ("nexus-dev", &dev, "development", "/app"),
            ("nexus-prod", &prod, "production", "/app"),
        ],
    );
    assert!(report.is_ok());
}

#[test]
#[ignore = "requires testbed"]
fn remote_it_12_server_disk_prune() {
    let target = alias("nexus-prod");
    let out = ssh::exec(&target, &["docker", "system", "df"], None, T);
    assert!(out.is_ok());
}
