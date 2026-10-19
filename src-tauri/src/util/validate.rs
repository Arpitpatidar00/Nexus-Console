use crate::error::{AppError, AppResult};

/// One name segment: lowercase alnum + `@ . _ + -`, never leading `.` or `-`
/// (kills `..` traversal and anything that could read as a flag).
fn segment_ok(s: &str) -> bool {
    !s.is_empty()
        && !s.starts_with(['.', '-'])
        && s.bytes().all(|b| {
            b.is_ascii_lowercase()
                || b.is_ascii_digit()
                || matches!(b, b'@' | b'.' | b'_' | b'+' | b'-')
        })
}

/// A formula is either `name` (core) or `user/repo/name` (third-party tap, e.g.
/// `mongodb/brew/mongodb-community@7.0` — what `brew search` prints). Reject
/// anything else — defense-in-depth even though args are always passed as an
/// array (never a shell).
pub fn validate_formula(name: &str) -> AppResult<()> {
    let segs: Vec<&str> = name.split('/').collect();
    if name.len() <= 128 && matches!(segs.len(), 1 | 3) && segs.iter().all(|s| segment_ok(s)) {
        Ok(())
    } else {
        Err(AppError::InvalidName(format!(
            "invalid formula name: {name}"
        )))
    }
}

/// A tap is exactly `user/repo`. Parsed out of brew's stderr, so validate it
/// before it becomes a `brew trust` argument.
pub fn validate_tap(tap: &str) -> AppResult<()> {
    let segs: Vec<&str> = tap.split('/').collect();
    if tap.len() <= 128 && segs.len() == 2 && segs.iter().all(|s| segment_ok(s)) {
        Ok(())
    } else {
        Err(AppError::InvalidName(format!("invalid tap name: {tap}")))
    }
}

/// The formula without its tap prefix — `mongodb/brew/mongodb-community@7.0` →
/// `mongodb-community@7.0`. brew's own output (`services list`, `opt/<name>`)
/// is always bare, so anything that matches or builds a path uses this.
pub fn bare_formula(name: &str) -> &str {
    name.rsplit('/').next().unwrap_or(name)
}

fn invalid(what: &str, v: &str) -> AppError {
    AppError::InvalidName(format!("invalid {what}: {v}"))
}

/// An ssh_config `Host` alias: `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`. It becomes
/// an ssh argv entry, so the leading-alnum rule is what keeps it from reading
/// as a flag.
pub fn validate_ssh_alias(alias: &str) -> AppResult<()> {
    let ok = alias.len() <= 128
        && alias.starts_with(|c: char| c.is_ascii_alphanumeric())
        && alias
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'));
    ok.then_some(()).ok_or_else(|| invalid("ssh alias", alias))
}

/// A DNS name (labels of alnum + `-`, never leading/trailing `-`) or an IPv4 /
/// IPv6 literal, ≤ 253 chars.
pub fn validate_hostname(host: &str) -> AppResult<()> {
    let is_ip = host.parse::<std::net::IpAddr>().is_ok();
    let is_dns = host.len() <= 253
        && host.split('.').all(|l| {
            !l.is_empty()
                && l.len() <= 63
                && !l.starts_with('-')
                && !l.ends_with('-')
                && l.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
        });
    (is_ip || is_dns)
        .then_some(())
        .ok_or_else(|| invalid("hostname", host))
}

/// A POSIX login name: `^[a-z_][a-z0-9_.-]{0,31}$`.
pub fn validate_ssh_user(user: &str) -> AppResult<()> {
    let ok = user.len() <= 32
        && user.starts_with(|c: char| c.is_ascii_lowercase() || c == '_')
        && user.bytes().all(|b| {
            b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'_' | b'.' | b'-')
        });
    ok.then_some(()).ok_or_else(|| invalid("ssh user", user))
}

pub fn validate_port(port: u32) -> AppResult<()> {
    (1..=65535)
        .contains(&port)
        .then_some(())
        .ok_or_else(|| invalid("port", &port.to_string()))
}

/// A Docker container id or name. Being well-formed isn't enough on its own:
/// callers also require the ref to appear in the host's latest snapshot.
// ponytail: first caller is the P5 docker actions.
#[allow(dead_code)]
pub fn validate_container_ref(r: &str) -> AppResult<()> {
    let ok = r.len() <= 128
        && r.starts_with(|c: char| c.is_ascii_alphanumeric())
        && r.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'.' | b'-'));
    ok.then_some(()).ok_or_else(|| invalid("container", r))
}

/// A manual host's key path: absolute or `~/`, no `..` segment. Only ever
/// passed to `ssh -i`; the app never opens it.
pub fn validate_identity_file(path: &str) -> AppResult<()> {
    let ok = path.len() <= 1024
        && (path.starts_with('/') || path.starts_with("~/"))
        && !path.split('/').any(|seg| seg == "..")
        && !path.chars().any(char::is_control);
    ok.then_some(())
        .ok_or_else(|| invalid("identity file", path))
}

/// Free-text display fields (host label, project): trimmed, 1–64 chars, no
/// control characters. Returns the trimmed value.
pub fn validate_display_text(what: &str, v: &str) -> AppResult<String> {
    let t = v.trim();
    let ok = !t.is_empty() && t.chars().count() <= 64 && !t.chars().any(char::is_control);
    ok.then(|| t.to_string()).ok_or_else(|| invalid(what, v))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_real_formulae() {
        assert!(validate_formula("redis").is_ok());
        assert!(validate_formula("postgresql@18").is_ok());
        assert!(validate_formula("mongodb-community").is_ok());
        // Tap-qualified: what `brew search mongodb` actually prints.
        assert!(validate_formula("mongodb/brew/mongodb-community@7.0").is_ok());
    }

    #[test]
    fn rejects_injection_and_junk() {
        assert!(validate_formula("redis; rm -rf /").is_err());
        assert!(validate_formula("../etc/passwd").is_err());
        assert!(validate_formula("a/../b").is_err());
        assert!(validate_formula("Redis").is_err());
        assert!(validate_formula("").is_err());
        assert!(validate_formula("mongodb/brew").is_err()); // tap, not a formula
        assert!(validate_formula("a/b/c/d").is_err());
    }

    #[test]
    fn taps_are_exactly_user_slash_repo() {
        assert!(validate_tap("mongodb/brew").is_ok());
        assert!(validate_tap("mongodb").is_err());
        assert!(validate_tap("mongodb/brew/x").is_err());
        assert!(validate_tap("../etc").is_err());
    }

    #[test]
    fn strips_the_tap_prefix() {
        assert_eq!(
            bare_formula("mongodb/brew/mongodb-community@7.0"),
            "mongodb-community@7.0"
        );
        assert_eq!(bare_formula("redis"), "redis");
    }

    #[test]
    fn ssh_aliases() {
        assert!(validate_ssh_alias("fameo-prod").is_ok());
        assert!(validate_ssh_alias("db.staging_2").is_ok());
        assert!(validate_ssh_alias("-oProxyCommand=x").is_err());
        assert!(validate_ssh_alias(".hidden").is_err());
        assert!(validate_ssh_alias("a b").is_err());
        assert!(validate_ssh_alias("web*").is_err());
        assert!(validate_ssh_alias("").is_err());
        assert!(validate_ssh_alias(&"a".repeat(129)).is_err());
    }

    #[test]
    fn hostnames_dns_and_ip_literals() {
        assert!(validate_hostname("api.fameo.io").is_ok());
        assert!(validate_hostname("10.0.0.12").is_ok());
        assert!(validate_hostname("::1").is_ok());
        assert!(validate_hostname("fe80::1ff:fe23:4567:890a").is_ok());
        assert!(validate_hostname("-oProxyCommand=x").is_err());
        assert!(validate_hostname("host-.io").is_err());
        assert!(validate_hostname("a..b").is_err());
        assert!(validate_hostname("user@host").is_err());
        assert!(validate_hostname("").is_err());
        assert!(validate_hostname(&format!("{}.io", "a".repeat(64))).is_err());
    }

    #[test]
    fn ssh_users() {
        assert!(validate_ssh_user("ubuntu").is_ok());
        assert!(validate_ssh_user("_svc.deploy-1").is_ok());
        assert!(validate_ssh_user("Root").is_err());
        assert!(validate_ssh_user("-l").is_err());
        assert!(validate_ssh_user("a@b").is_err());
        assert!(validate_ssh_user(&"a".repeat(33)).is_err());
    }

    #[test]
    fn ports() {
        assert!(validate_port(22).is_ok());
        assert!(validate_port(65535).is_ok());
        assert!(validate_port(0).is_err());
        assert!(validate_port(65536).is_err());
    }

    #[test]
    fn container_refs() {
        assert!(validate_container_ref("api-1").is_ok());
        assert!(validate_container_ref("3f2a9c0b1d4e").is_ok());
        assert!(validate_container_ref("nexus-testbed_web.1").is_ok());
        assert!(validate_container_ref("--privileged").is_err());
        assert!(validate_container_ref("a;b").is_err());
        assert!(validate_container_ref("/web").is_err());
    }

    #[test]
    fn identity_files() {
        assert!(validate_identity_file("~/.ssh/id_ed25519").is_ok());
        assert!(validate_identity_file("/Users/me/keys/prod.pem").is_ok());
        assert!(validate_identity_file("id_rsa").is_err());
        assert!(validate_identity_file("~/../etc/passwd").is_err());
        assert!(validate_identity_file("~/.ssh/a\nb").is_err());
    }

    #[test]
    fn display_text_is_trimmed_and_bounded() {
        assert_eq!(
            validate_display_text("label", "  Fameo API ").unwrap(),
            "Fameo API"
        );
        assert!(validate_display_text("label", "   ").is_err());
        assert!(validate_display_text("label", &"x".repeat(65)).is_err());
        assert!(validate_display_text("label", "a\tb").is_err());
    }
}
