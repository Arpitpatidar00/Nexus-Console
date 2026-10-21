use std::convert::TryFrom;

use stackroost_lib::core::util::validate as util_validate;
use stackroost_lib::core::validate::{
    validate_alphanumeric_slug, AvdName, AwsProfile, AwsRegion, ComposeProject, ComposeService,
    DbName, DbUser, DomainName, Ec2InstanceId, HostName, ImageRef, IpAddr, KegVersion, Port,
    RemotePath, SimUdid,
};

/// Security attack payloads required by PLAN.md §A.3.
/// Every validator and every command taking text must reject all of these.
const ATTACK_PAYLOADS: &[&str] = &[
    "; rm -rf ~",
    "$(id)",
    "`id`",
    "' ; id ; '",
    "\" ; id ; \"",
    "a\nb",
    "-oProxyCommand=id",
    "--help",
    "../../etc/passwd",
    "a b",
    "\0",
    "a\0b",
    "", // empty string
];

const UNICODE_HOMOGLYPH: &str = "ехample.com"; // Cyrillic 'е' and 'х'

#[test]
fn test_hostname_rejects_all_payloads() {
    let long_payload = "a".repeat(300);
    for payload in ATTACK_PAYLOADS {
        assert!(
            HostName::try_from(*payload).is_err(),
            "HostName accepted attack payload: {payload:?}"
        );
    }
    assert!(HostName::try_from(long_payload.as_str()).is_err());
    assert!(HostName::try_from(UNICODE_HOMOGLYPH).is_err());
}

#[test]
fn test_domain_name_rejects_all_payloads() {
    let long_payload = format!("{}.com", "a".repeat(300));
    for payload in ATTACK_PAYLOADS {
        assert!(
            DomainName::try_from(*payload).is_err(),
            "DomainName accepted attack payload: {payload:?}"
        );
    }
    assert!(DomainName::try_from(long_payload.as_str()).is_err());
    assert!(DomainName::try_from(UNICODE_HOMOGLYPH).is_err());
}

#[test]
fn test_db_name_rejects_all_payloads() {
    let long_payload = "a".repeat(300);
    for payload in ATTACK_PAYLOADS {
        assert!(
            DbName::try_from(*payload).is_err(),
            "DbName accepted attack payload: {payload:?}"
        );
    }
    assert!(DbName::try_from(long_payload.as_str()).is_err());
    assert!(DbName::try_from(UNICODE_HOMOGLYPH).is_err());
}

#[test]
fn test_db_user_rejects_all_payloads() {
    let long_payload = "a".repeat(300);
    for payload in ATTACK_PAYLOADS {
        assert!(
            DbUser::try_from(*payload).is_err(),
            "DbUser accepted attack payload: {payload:?}"
        );
    }
    assert!(DbUser::try_from(long_payload.as_str()).is_err());
    assert!(DbUser::try_from(UNICODE_HOMOGLYPH).is_err());
}

#[test]
fn test_compose_project_rejects_all_payloads() {
    let long_payload = "a".repeat(300);
    for payload in ATTACK_PAYLOADS {
        assert!(
            ComposeProject::try_from(*payload).is_err(),
            "ComposeProject accepted attack payload: {payload:?}"
        );
    }
    assert!(ComposeProject::try_from(long_payload.as_str()).is_err());
    assert!(ComposeProject::try_from(UNICODE_HOMOGLYPH).is_err());
}

#[test]
fn test_compose_service_rejects_all_payloads() {
    let long_payload = "a".repeat(300);
    for payload in ATTACK_PAYLOADS {
        assert!(
            ComposeService::try_from(*payload).is_err(),
            "ComposeService accepted attack payload: {payload:?}"
        );
    }
    assert!(ComposeService::try_from(long_payload.as_str()).is_err());
    assert!(ComposeService::try_from(UNICODE_HOMOGLYPH).is_err());
}

#[test]
fn test_image_ref_rejects_all_payloads() {
    let long_payload = "a".repeat(300);
    for payload in ATTACK_PAYLOADS {
        assert!(
            ImageRef::try_from(*payload).is_err(),
            "ImageRef accepted attack payload: {payload:?}"
        );
    }
    assert!(ImageRef::try_from(long_payload.as_str()).is_err());
    assert!(ImageRef::try_from(UNICODE_HOMOGLYPH).is_err());
}

#[test]
fn test_remote_path_rejects_all_payloads() {
    let long_payload = format!("/tmp/{}", "a".repeat(1100));
    for payload in ATTACK_PAYLOADS {
        assert!(
            RemotePath::try_from(*payload).is_err(),
            "RemotePath accepted attack payload: {payload:?}"
        );
    }
    assert!(RemotePath::try_from(long_payload.as_str()).is_err());
    // Path traversal in middle of path
    assert!(RemotePath::try_from("/var/log/../../etc/shadow").is_err());
}

#[test]
fn test_ec2_instance_id_rejects_all_payloads() {
    for payload in ATTACK_PAYLOADS {
        assert!(
            Ec2InstanceId::try_from(*payload).is_err(),
            "Ec2InstanceId accepted attack payload: {payload:?}"
        );
    }
    assert!(Ec2InstanceId::try_from("i-INVALIDHEX123").is_err());
    assert!(Ec2InstanceId::try_from("i-1234").is_err()); // too short
}

#[test]
fn test_aws_region_rejects_all_payloads() {
    for payload in ATTACK_PAYLOADS {
        assert!(
            AwsRegion::try_from(*payload).is_err(),
            "AwsRegion accepted attack payload: {payload:?}"
        );
    }
    assert!(AwsRegion::try_from("us-east-1;id").is_err());
}

#[test]
fn test_aws_profile_rejects_all_payloads() {
    let long_payload = "a".repeat(300);
    for payload in ATTACK_PAYLOADS {
        assert!(
            AwsProfile::try_from(*payload).is_err(),
            "AwsProfile accepted attack payload: {payload:?}"
        );
    }
    assert!(AwsProfile::try_from(long_payload.as_str()).is_err());
    assert!(AwsProfile::try_from(UNICODE_HOMOGLYPH).is_err());
}

#[test]
fn test_sim_udid_rejects_all_payloads() {
    for payload in ATTACK_PAYLOADS {
        assert!(
            SimUdid::try_from(*payload).is_err(),
            "SimUdid accepted attack payload: {payload:?}"
        );
    }
}

#[test]
fn test_avd_name_rejects_all_payloads() {
    let long_payload = "a".repeat(300);
    for payload in ATTACK_PAYLOADS {
        assert!(
            AvdName::try_from(*payload).is_err(),
            "AvdName accepted attack payload: {payload:?}"
        );
    }
    assert!(AvdName::try_from(long_payload.as_str()).is_err());
}

#[test]
fn test_keg_version_rejects_all_payloads() {
    let long_payload = "a".repeat(300);
    for payload in ATTACK_PAYLOADS {
        assert!(
            KegVersion::try_from(*payload).is_err(),
            "KegVersion accepted attack payload: {payload:?}"
        );
    }
    assert!(KegVersion::try_from(long_payload.as_str()).is_err());
}

#[test]
fn test_ip_addr_rejects_all_payloads() {
    for payload in ATTACK_PAYLOADS {
        assert!(
            IpAddr::try_from(*payload).is_err(),
            "IpAddr accepted attack payload: {payload:?}"
        );
    }
}

#[test]
fn test_port_rejects_all_payloads() {
    for payload in ATTACK_PAYLOADS {
        assert!(
            Port::try_from(*payload).is_err(),
            "Port accepted attack payload: {payload:?}"
        );
    }
    assert!(Port::try_from("0").is_err()); // port 0 disallowed
    assert!(Port::try_from("70000").is_err()); // out of u16 range
}

#[test]
fn test_alphanumeric_slug_rejects_all_payloads() {
    let long_payload = "a".repeat(300);
    for payload in ATTACK_PAYLOADS {
        assert!(
            validate_alphanumeric_slug(payload, "slug").is_err(),
            "validate_alphanumeric_slug accepted attack payload: {payload:?}"
        );
    }
    assert!(validate_alphanumeric_slug(&long_payload, "slug").is_err());
    assert!(validate_alphanumeric_slug(UNICODE_HOMOGLYPH, "slug").is_err());
}

#[test]
fn test_util_validators_reject_payloads() {
    for payload in ATTACK_PAYLOADS {
        assert!(util_validate::validate_formula(payload).is_err());
        assert!(util_validate::validate_tap(payload).is_err());
        assert!(util_validate::validate_ssh_alias(payload).is_err());
        assert!(util_validate::validate_ssh_user(payload).is_err());
        assert!(util_validate::validate_container_ref(payload).is_err());
        assert!(util_validate::validate_identity_file(payload).is_err());
    }
}
