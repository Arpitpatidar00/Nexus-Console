use std::fmt;
use std::net::IpAddr as StdIpAddr;
use std::ops::Deref;
use std::str::FromStr;

use serde::{Deserialize, Serialize};

use crate::core::error::{AppError, AppResult};

/// Helper function to reject common injection characters and control characters.
fn has_shell_or_control(s: &str) -> bool {
    s.chars().any(|c| {
        c.is_control()
            || matches!(
                c,
                ';' | '&'
                    | '|'
                    | '$'
                    | '`'
                    | '\\'
                    | '<'
                    | '>'
                    | '"'
                    | '\''
                    | '('
                    | ')'
                    | '{'
                    | '}'
                    | '\n'
                    | '\r'
                    | '\0'
            )
    })
}

/// Helper macro to generate a string newtype with validation, standard traits, and serde.
macro_rules! validate_string_newtype {
    ($name:ident, $validator:ident, $err_name:literal) => {
        #[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(try_from = "String", into = "String")]
        pub struct $name(String);

        impl $name {
            pub fn as_str(&self) -> &str {
                &self.0
            }

            pub fn into_inner(self) -> String {
                self.0
            }
        }

        impl Deref for $name {
            type Target = str;
            fn deref(&self) -> &Self::Target {
                &self.0
            }
        }

        impl AsRef<str> for $name {
            fn as_ref(&self) -> &str {
                &self.0
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(f, "{}", self.0)
            }
        }

        impl TryFrom<&str> for $name {
            type Error = AppError;
            fn try_from(s: &str) -> Result<Self, Self::Error> {
                $validator(s).map(|_| Self(s.to_string()))
            }
        }

        impl TryFrom<String> for $name {
            type Error = AppError;
            fn try_from(s: String) -> Result<Self, Self::Error> {
                $validator(&s).map(|_| Self(s))
            }
        }

        impl From<$name> for String {
            fn from(val: $name) -> Self {
                val.0
            }
        }

        impl FromStr for $name {
            type Err = AppError;
            fn from_str(s: &str) -> Result<Self, Self::Err> {
                Self::try_from(s)
            }
        }
    };
}

// -----------------------------------------------------------------------------
// Validators
// -----------------------------------------------------------------------------

pub fn check_hostname(host: &str) -> AppResult<()> {
    if host.is_empty()
        || host.len() > 253
        || host.contains(char::is_whitespace)
        || has_shell_or_control(host)
    {
        return Err(AppError::InvalidName(format!("invalid hostname: {host}")));
    }
    // Check if valid IP literal
    if host.parse::<StdIpAddr>().is_ok() {
        return Ok(());
    }
    // Check DNS name
    let labels: Vec<&str> = host.split('.').collect();
    let is_valid_dns = labels.iter().all(|l| {
        !l.is_empty()
            && l.len() <= 63
            && !l.starts_with('-')
            && !l.ends_with('-')
            && l.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
    });
    if is_valid_dns && !labels.is_empty() {
        Ok(())
    } else {
        Err(AppError::InvalidName(format!("invalid hostname: {host}")))
    }
}

pub fn check_domain_name(domain: &str) -> AppResult<()> {
    if domain.is_empty()
        || domain.len() > 253
        || domain.contains(char::is_whitespace)
        || has_shell_or_control(domain)
    {
        return Err(AppError::InvalidName(format!(
            "invalid domain name: {domain}"
        )));
    }
    let labels: Vec<&str> = domain.split('.').collect();
    if labels.len() < 2 {
        return Err(AppError::InvalidName(format!(
            "domain name requires at least two labels: {domain}"
        )));
    }
    let is_valid = labels.iter().all(|l| {
        !l.is_empty()
            && l.len() <= 63
            && !l.starts_with('-')
            && !l.ends_with('-')
            && l.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
    });
    // TLD must contain at least one non-numeric char (prevents interpreting raw IP as domain)
    let tld = labels.last().unwrap();
    if is_valid && tld.bytes().any(|b| b.is_ascii_alphabetic()) {
        Ok(())
    } else {
        Err(AppError::InvalidName(format!(
            "invalid domain name: {domain}"
        )))
    }
}

pub fn check_db_name(name: &str) -> AppResult<()> {
    if name.is_empty()
        || name.len() > 63
        || name.contains(char::is_whitespace)
        || has_shell_or_control(name)
        || name.starts_with('-')
    {
        return Err(AppError::InvalidName(format!(
            "invalid database name: {name}"
        )));
    }
    // Standard SQL identifier: starts with ascii letter or underscore, followed by alnum or underscore
    let first = name.chars().next().unwrap();
    if (first.is_ascii_alphabetic() || first == '_')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        Ok(())
    } else {
        Err(AppError::InvalidName(format!(
            "invalid database name: {name}"
        )))
    }
}

pub fn check_db_user(user: &str) -> AppResult<()> {
    if user.is_empty()
        || user.len() > 32
        || user.contains(char::is_whitespace)
        || has_shell_or_control(user)
        || user.starts_with('-')
    {
        return Err(AppError::InvalidName(format!(
            "invalid database user: {user}"
        )));
    }
    let first = user.chars().next().unwrap();
    if (first.is_ascii_alphabetic() || first == '_')
        && user.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        Ok(())
    } else {
        Err(AppError::InvalidName(format!(
            "invalid database user: {user}"
        )))
    }
}

pub fn check_compose_project(name: &str) -> AppResult<()> {
    if name.is_empty()
        || name.len() > 64
        || name.contains(char::is_whitespace)
        || has_shell_or_control(name)
        || name.starts_with(['-', '.'])
    {
        return Err(AppError::InvalidName(format!(
            "invalid compose project: {name}"
        )));
    }
    if name
        .bytes()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'-' | b'_'))
    {
        Ok(())
    } else {
        Err(AppError::InvalidName(format!(
            "invalid compose project: {name}"
        )))
    }
}

pub fn check_compose_service(name: &str) -> AppResult<()> {
    if name.is_empty()
        || name.len() > 64
        || name.contains(char::is_whitespace)
        || has_shell_or_control(name)
        || name.starts_with(['-', '.'])
    {
        return Err(AppError::InvalidName(format!(
            "invalid compose service: {name}"
        )));
    }
    if name
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
    {
        Ok(())
    } else {
        Err(AppError::InvalidName(format!(
            "invalid compose service: {name}"
        )))
    }
}

pub fn check_image_ref(image: &str) -> AppResult<()> {
    if image.is_empty()
        || image.len() > 256
        || image.contains(char::is_whitespace)
        || has_shell_or_control(image)
        || image.starts_with(['-', '.'])
    {
        return Err(AppError::InvalidName(format!(
            "invalid container image ref: {image}"
        )));
    }
    // Standard image syntax: [registry/][user/]name[:tag][@digest]
    if image
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-' | b'/' | b':' | b'@'))
    {
        Ok(())
    } else {
        Err(AppError::InvalidName(format!(
            "invalid container image ref: {image}"
        )))
    }
}

pub fn check_remote_path(path: &str) -> AppResult<()> {
    if path.is_empty()
        || path.len() > 1024
        || (!path.starts_with('/') && !path.starts_with("~/") && path != "~")
        || has_shell_or_control(path)
    {
        return Err(AppError::InvalidName(format!(
            "invalid remote path: {path}"
        )));
    }
    // Prohibit traversal segments
    for seg in path.split('/') {
        if seg == ".." {
            return Err(AppError::InvalidName(format!(
                "path traversal rejected in remote path: {path}"
            )));
        }
    }
    Ok(())
}

pub fn check_ec2_instance_id(id: &str) -> AppResult<()> {
    // Matches i-01234567 or i-0123456789abcdef0 (8 to 17 hex characters)
    let valid = (id.len() == 10 || id.len() == 19)
        && id.starts_with("i-")
        && id[2..]
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase());
    if valid {
        Ok(())
    } else {
        Err(AppError::InvalidName(format!(
            "invalid EC2 instance id: {id}"
        )))
    }
}

pub fn check_aws_region(region: &str) -> AppResult<()> {
    // Format: e.g. us-east-1, eu-central-1, ap-southeast-2
    let parts: Vec<&str> = region.split('-').collect();
    let valid = parts.len() == 3
        && !parts[0].is_empty()
        && parts[0].bytes().all(|b| b.is_ascii_lowercase())
        && !parts[1].is_empty()
        && parts[1].bytes().all(|b| b.is_ascii_lowercase())
        && !parts[2].is_empty()
        && parts[2].bytes().all(|b| b.is_ascii_digit());
    if valid {
        Ok(())
    } else {
        Err(AppError::InvalidName(format!(
            "invalid AWS region: {region}"
        )))
    }
}

pub fn check_aws_profile(profile: &str) -> AppResult<()> {
    if profile.is_empty()
        || profile.len() > 64
        || profile.contains(char::is_whitespace)
        || has_shell_or_control(profile)
        || profile.starts_with(['-', '.'])
    {
        return Err(AppError::InvalidName(format!(
            "invalid AWS profile name: {profile}"
        )));
    }
    if profile
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.'))
    {
        Ok(())
    } else {
        Err(AppError::InvalidName(format!(
            "invalid AWS profile name: {profile}"
        )))
    }
}

pub fn check_sim_udid(udid: &str) -> AppResult<()> {
    // Standard UUID format: 8-4-4-4-12 hex characters
    let parts: Vec<&str> = udid.split('-').collect();
    let valid = parts.len() == 5
        && parts[0].len() == 8
        && parts[1].len() == 4
        && parts[2].len() == 4
        && parts[3].len() == 4
        && parts[4].len() == 12
        && udid.chars().all(|c| c == '-' || c.is_ascii_hexdigit());
    if valid {
        Ok(())
    } else {
        Err(AppError::InvalidName(format!(
            "invalid Simulator UDID: {udid}"
        )))
    }
}

pub fn check_avd_name(name: &str) -> AppResult<()> {
    if name.is_empty()
        || name.len() > 64
        || name.contains(char::is_whitespace)
        || has_shell_or_control(name)
        || name.starts_with(['-', '.'])
    {
        return Err(AppError::InvalidName(format!("invalid AVD name: {name}")));
    }
    if name
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-'))
    {
        Ok(())
    } else {
        Err(AppError::InvalidName(format!("invalid AVD name: {name}")))
    }
}

pub fn check_keg_version(version: &str) -> AppResult<()> {
    if version.is_empty()
        || version.len() > 64
        || version.contains(char::is_whitespace)
        || has_shell_or_control(version)
        || version.starts_with(['-', '.'])
    {
        return Err(AppError::InvalidName(format!(
            "invalid Keg version: {version}"
        )));
    }
    if version
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-' | b'+' | b'@'))
    {
        Ok(())
    } else {
        Err(AppError::InvalidName(format!(
            "invalid Keg version: {version}"
        )))
    }
}

pub fn validate_alphanumeric_slug(s: &str, field: &str) -> AppResult<()> {
    if s.is_empty() || s.len() > 128 || has_shell_or_control(s) || s.starts_with('-') {
        return Err(AppError::InvalidName(format!(
            "{field} cannot be empty, start with '-' or exceed 128 chars"
        )));
    }
    if !s
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err(AppError::InvalidName(format!(
            "{field} contains invalid characters"
        )));
    }
    Ok(())
}

// -----------------------------------------------------------------------------
// Newtypes
// -----------------------------------------------------------------------------

validate_string_newtype!(HostName, check_hostname, "hostname");
validate_string_newtype!(DomainName, check_domain_name, "domain");
validate_string_newtype!(DbName, check_db_name, "database name");
validate_string_newtype!(DbUser, check_db_user, "database user");
validate_string_newtype!(ComposeProject, check_compose_project, "compose project");
validate_string_newtype!(ComposeService, check_compose_service, "compose service");
validate_string_newtype!(ImageRef, check_image_ref, "image ref");
validate_string_newtype!(RemotePath, check_remote_path, "remote path");
validate_string_newtype!(Ec2InstanceId, check_ec2_instance_id, "EC2 instance id");
validate_string_newtype!(AwsRegion, check_aws_region, "AWS region");
validate_string_newtype!(AwsProfile, check_aws_profile, "AWS profile");
validate_string_newtype!(SimUdid, check_sim_udid, "simulator UDID");
validate_string_newtype!(AvdName, check_avd_name, "AVD name");
validate_string_newtype!(KegVersion, check_keg_version, "keg version");

/// IpAddr newtype wrapping `std::net::IpAddr`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct IpAddr(pub StdIpAddr);

impl Deref for IpAddr {
    type Target = StdIpAddr;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl fmt::Display for IpAddr {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl TryFrom<&str> for IpAddr {
    type Error = AppError;
    fn try_from(s: &str) -> Result<Self, Self::Error> {
        s.trim()
            .parse::<StdIpAddr>()
            .map(Self)
            .map_err(|e| AppError::InvalidName(format!("invalid IP address '{s}': {e}")))
    }
}

impl TryFrom<String> for IpAddr {
    type Error = AppError;
    fn try_from(s: String) -> Result<Self, Self::Error> {
        Self::try_from(s.as_str())
    }
}

impl From<IpAddr> for String {
    fn from(ip: IpAddr) -> Self {
        ip.0.to_string()
    }
}

/// Port newtype wrapping 1..=65535.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(try_from = "u32", into = "u16")]
pub struct Port(pub u16);

impl Port {
    pub fn as_u16(&self) -> u16 {
        self.0
    }
}

impl Deref for Port {
    type Target = u16;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl fmt::Display for Port {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl TryFrom<u16> for Port {
    type Error = AppError;
    fn try_from(v: u16) -> Result<Self, Self::Error> {
        Self::try_from(v as u32)
    }
}

impl TryFrom<i32> for Port {
    type Error = AppError;
    fn try_from(v: i32) -> Result<Self, Self::Error> {
        if v > 0 {
            Self::try_from(v as u32)
        } else {
            Err(AppError::InvalidName(format!("port {v} must be positive")))
        }
    }
}

impl TryFrom<u32> for Port {
    type Error = AppError;
    fn try_from(v: u32) -> Result<Self, Self::Error> {
        if (1..=65535).contains(&v) {
            Ok(Self(v as u16))
        } else {
            Err(AppError::InvalidName(format!(
                "port {v} out of range 1..=65535"
            )))
        }
    }
}

impl TryFrom<&str> for Port {
    type Error = AppError;
    fn try_from(s: &str) -> Result<Self, Self::Error> {
        let v = s
            .trim()
            .parse::<u32>()
            .map_err(|_| AppError::InvalidName(format!("invalid port number: {s}")))?;
        Self::try_from(v)
    }
}

impl From<Port> for u16 {
    fn from(p: Port) -> Self {
        p.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The standard malicious injection payload catalogue defined in §T & §A.3.
    const INJECTION_PAYLOADS: &[&str] = &[
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
        "a\0b",
        "ехample.com", // Cyrillic homoglyph
        "",
    ];

    #[test]
    fn hostname_valid_cases() {
        assert!(HostName::try_from("example.com").is_ok());
        assert!(HostName::try_from("sub.domain.co.uk").is_ok());
        assert!(HostName::try_from("127.0.0.1").is_ok());
        assert!(HostName::try_from("::1").is_ok());
        assert!(HostName::try_from("2001:db8::1").is_ok());
    }

    #[test]
    fn hostname_rejects_payloads() {
        for payload in INJECTION_PAYLOADS {
            assert!(
                HostName::try_from(*payload).is_err(),
                "HostName should reject: {payload}"
            );
        }
        let long = "a".repeat(300);
        assert!(HostName::try_from(long.as_str()).is_err());
    }

    #[test]
    fn domain_name_valid_cases() {
        assert!(DomainName::try_from("example.com").is_ok());
        assert!(DomainName::try_from("api.staging.internal.io").is_ok());
    }

    #[test]
    fn domain_name_rejects_payloads() {
        for payload in INJECTION_PAYLOADS {
            assert!(
                DomainName::try_from(*payload).is_err(),
                "DomainName should reject: {payload}"
            );
        }
        // Single label should fail
        assert!(DomainName::try_from("localhost").is_err());
        // IP literal should fail (must be domain name)
        assert!(DomainName::try_from("127.0.0.1").is_err());
    }

    #[test]
    fn db_name_valid_and_rejects_payloads() {
        assert!(DbName::try_from("postgres").is_ok());
        assert!(DbName::try_from("my_db_2").is_ok());
        assert!(DbName::try_from("_app_db").is_ok());

        for payload in INJECTION_PAYLOADS {
            assert!(
                DbName::try_from(*payload).is_err(),
                "DbName should reject: {payload}"
            );
        }
        assert!(DbName::try_from("db-hyphen").is_err());
        assert!(DbName::try_from("123starts_digit").is_err());
    }

    #[test]
    fn db_user_valid_and_rejects_payloads() {
        assert!(DbUser::try_from("root").is_ok());
        assert!(DbUser::try_from("app_user").is_ok());

        for payload in INJECTION_PAYLOADS {
            assert!(
                DbUser::try_from(*payload).is_err(),
                "DbUser should reject: {payload}"
            );
        }
    }

    #[test]
    fn compose_project_valid_and_rejects_payloads() {
        assert!(ComposeProject::try_from("stackroost_web").is_ok());
        assert!(ComposeProject::try_from("nexus-staging-1").is_ok());

        for payload in INJECTION_PAYLOADS {
            assert!(
                ComposeProject::try_from(*payload).is_err(),
                "ComposeProject should reject: {payload}"
            );
        }
    }

    #[test]
    fn compose_service_valid_and_rejects_payloads() {
        assert!(ComposeService::try_from("api-server").is_ok());
        assert!(ComposeService::try_from("worker_1").is_ok());

        for payload in INJECTION_PAYLOADS {
            assert!(
                ComposeService::try_from(*payload).is_err(),
                "ComposeService should reject: {payload}"
            );
        }
    }

    #[test]
    fn image_ref_valid_and_rejects_payloads() {
        assert!(ImageRef::try_from("redis:7-alpine").is_ok());
        assert!(ImageRef::try_from("ghcr.io/org/repo:v1.2.3").is_ok());
        assert!(ImageRef::try_from(
            "node:18@sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
        )
        .is_ok());

        for payload in INJECTION_PAYLOADS {
            assert!(
                ImageRef::try_from(*payload).is_err(),
                "ImageRef should reject: {payload}"
            );
        }
    }

    #[test]
    fn remote_path_valid_and_rejects_payloads() {
        assert!(RemotePath::try_from("/var/log/nginx/access.log").is_ok());
        assert!(RemotePath::try_from("/home/ubuntu/app/data.json").is_ok());

        for payload in INJECTION_PAYLOADS {
            assert!(
                RemotePath::try_from(*payload).is_err(),
                "RemotePath should reject: {payload}"
            );
        }
        assert!(RemotePath::try_from("/var/log/../../etc/passwd").is_err());
        assert!(RemotePath::try_from("relative/path").is_err());
    }

    #[test]
    fn ec2_instance_id_valid_and_rejects_payloads() {
        assert!(Ec2InstanceId::try_from("i-12345678").is_ok());
        assert!(Ec2InstanceId::try_from("i-0123456789abcdef0").is_ok());

        for payload in INJECTION_PAYLOADS {
            assert!(
                Ec2InstanceId::try_from(*payload).is_err(),
                "Ec2InstanceId should reject: {payload}"
            );
        }
        assert!(Ec2InstanceId::try_from("i-ABCDEF01").is_err()); // uppercase rejected
        assert!(Ec2InstanceId::try_from("vol-12345678").is_err());
    }

    #[test]
    fn aws_region_valid_and_rejects_payloads() {
        assert!(AwsRegion::try_from("us-east-1").is_ok());
        assert!(AwsRegion::try_from("eu-west-3").is_ok());
        assert!(AwsRegion::try_from("ap-southeast-1").is_ok());

        for payload in INJECTION_PAYLOADS {
            assert!(
                AwsRegion::try_from(*payload).is_err(),
                "AwsRegion should reject: {payload}"
            );
        }
    }

    #[test]
    fn aws_profile_valid_and_rejects_payloads() {
        assert!(AwsProfile::try_from("default").is_ok());
        assert!(AwsProfile::try_from("production_admin").is_ok());
        assert!(AwsProfile::try_from("team-prod.readonly").is_ok());

        for payload in INJECTION_PAYLOADS {
            assert!(
                AwsProfile::try_from(*payload).is_err(),
                "AwsProfile should reject: {payload}"
            );
        }
    }

    #[test]
    fn sim_udid_valid_and_rejects_payloads() {
        assert!(SimUdid::try_from("E621E1F8-C36C-495A-93FC-0C247A3E6E5F").is_ok());
        assert!(SimUdid::try_from("e621e1f8-c36c-495a-93fc-0c247a3e6e5f").is_ok());

        for payload in INJECTION_PAYLOADS {
            assert!(
                SimUdid::try_from(*payload).is_err(),
                "SimUdid should reject: {payload}"
            );
        }
    }

    #[test]
    fn avd_name_valid_and_rejects_payloads() {
        assert!(AvdName::try_from("Pixel_7_API_34").is_ok());
        assert!(AvdName::try_from("nexus_5").is_ok());

        for payload in INJECTION_PAYLOADS {
            assert!(
                AvdName::try_from(*payload).is_err(),
                "AvdName should reject: {payload}"
            );
        }
    }

    #[test]
    fn keg_version_valid_and_rejects_payloads() {
        assert!(KegVersion::try_from("1.2.3").is_ok());
        assert!(KegVersion::try_from("18.1_1").is_ok());
        assert!(KegVersion::try_from("7.0@beta+git").is_ok());

        for payload in INJECTION_PAYLOADS {
            assert!(
                KegVersion::try_from(*payload).is_err(),
                "KegVersion should reject: {payload}"
            );
        }
    }

    #[test]
    fn ip_addr_and_port_reject_payloads() {
        assert!(IpAddr::try_from("192.168.1.1").is_ok());
        assert!(IpAddr::try_from("::1").is_ok());

        for payload in INJECTION_PAYLOADS {
            assert!(
                IpAddr::try_from(*payload).is_err(),
                "IpAddr should reject: {payload}"
            );
            assert!(
                Port::try_from(*payload).is_err(),
                "Port should reject: {payload}"
            );
        }

        assert!(Port::try_from(80).is_ok());
        assert!(Port::try_from(65535).is_ok());
        assert!(Port::try_from(0).is_err());
        assert!(Port::try_from(65536).is_err());
    }
}
