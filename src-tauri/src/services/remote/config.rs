// Host discovery from the user's ssh_config (docs/remote/PLAN.md §4.4). We only
// *list* aliases ourselves; `ssh -G` resolves them, so OpenSSH's own semantics
// (Match, Include order, first-wins) are never re-implemented. Callers check
// consent first. Nothing in ~/.ssh other than `config` and its includes is
// ever opened. Key files and known_hosts are never read.

use super::ssh::{base_args, SSH_BIN};
use crate::error::{AppError, AppResult};
use crate::util::validate::validate_ssh_alias;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;

const MAX_INCLUDE_DEPTH: usize = 5;

/// What `ssh -G <alias>` says the alias connects to.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedHost {
    pub hostname: String,
    pub user: String,
    pub port: u32,
    pub proxy_jump: Option<String>,
    pub identity_files: Vec<String>,
}

/// `(config file, ~/.ssh)`: the user's own, or the testbed's config in debug
/// builds when `NEXUS_SSH_CONFIG` is set (same gate as `ssh::base_args`).
pub fn user_config() -> AppResult<(PathBuf, PathBuf)> {
    let home = std::env::var_os("HOME").ok_or_else(|| AppError::NotFound("HOME not set".into()))?;
    let ssh_dir = PathBuf::from(home).join(".ssh");
    if cfg!(debug_assertions) {
        if let Some(p) = std::env::var_os("NEXUS_SSH_CONFIG") {
            return Ok((PathBuf::from(p), ssh_dir));
        }
    }
    Ok((ssh_dir.join("config"), ssh_dir))
}

/// Concrete aliases from `config` and everything it `Include`s, in file order,
/// deduplicated. Patterns (`*`, `?`, `!`) aren't hosts and are skipped. A
/// missing config is just an empty list.
pub fn list_config_aliases(config: &Path, ssh_dir: &Path) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen_files = HashSet::new();
    walk(config, ssh_dir, 0, &mut seen_files, &mut out);
    let mut seen = HashSet::new();
    out.retain(|a| seen.insert(a.clone()));
    out
}

fn walk(
    file: &Path,
    ssh_dir: &Path,
    depth: usize,
    seen: &mut HashSet<PathBuf>,
    out: &mut Vec<String>,
) {
    if depth > MAX_INCLUDE_DEPTH {
        return;
    }
    let key = file.canonicalize().unwrap_or_else(|_| file.to_path_buf());
    if !seen.insert(key) {
        return; // include cycle
    }
    let Ok(raw) = std::fs::read_to_string(file) else {
        return;
    };
    for line in raw.lines() {
        let Some((keyword, args)) = split_keyword(line) else {
            continue;
        };
        if keyword.eq_ignore_ascii_case("host") {
            out.extend(
                tokens(args)
                    .into_iter()
                    .filter(|t| !t.contains(['*', '?', '!']))
                    .filter(|t| validate_ssh_alias(t).is_ok()),
            );
        } else if keyword.eq_ignore_ascii_case("include") {
            for pattern in tokens(args) {
                for inc in expand_include(&pattern, ssh_dir) {
                    walk(&inc, ssh_dir, depth + 1, seen, out);
                }
            }
        }
    }
}

/// `Keyword args` or `Keyword=args`, comments and blanks skipped.
fn split_keyword(line: &str) -> Option<(&str, &str)> {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') {
        return None;
    }
    let end = line.find(|c: char| c.is_whitespace() || c == '=')?;
    let rest = line[end..].trim_start();
    let rest = rest.strip_prefix('=').unwrap_or(rest).trim_start();
    Some((&line[..end], rest))
}

/// Whitespace-separated, honouring double quotes; a `#` token ends the line.
fn tokens(args: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quoted = false;
    for c in args.chars() {
        match c {
            '"' => quoted = !quoted,
            '#' if !quoted && cur.is_empty() => break,
            c if c.is_whitespace() && !quoted => {
                if !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                }
            }
            c => cur.push(c),
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

/// OpenSSH rules: `~/` is home, a relative path is relative to `~/.ssh`, and
/// globs expand in sorted order.
fn expand_include(pattern: &str, ssh_dir: &Path) -> Vec<PathBuf> {
    let path = if let Some(rest) = pattern.strip_prefix("~/") {
        match ssh_dir.parent() {
            Some(home) => home.join(rest),
            None => return vec![],
        }
    } else if pattern.starts_with('/') {
        PathBuf::from(pattern)
    } else {
        ssh_dir.join(pattern)
    };
    let mut found = vec![PathBuf::from("/")];
    for comp in path.components().skip(1) {
        let comp = comp.as_os_str().to_string_lossy();
        found = found
            .into_iter()
            .flat_map(|base| {
                if !comp.contains(['*', '?']) {
                    return vec![base.join(comp.as_ref())];
                }
                let mut hits: Vec<PathBuf> = std::fs::read_dir(&base)
                    .into_iter()
                    .flatten()
                    .filter_map(Result::ok)
                    .filter(|e| {
                        let n = e.file_name().to_string_lossy().into_owned();
                        !n.starts_with('.') && glob_match(&comp, &n)
                    })
                    .map(|e| e.path())
                    .collect();
                hits.sort();
                hits
            })
            .collect();
    }
    found.retain(|p| p.is_file());
    found
}

/// `*` and `?` only, which is what ssh_config Include patterns use.
fn glob_match(pat: &str, name: &str) -> bool {
    let (p, n): (Vec<char>, Vec<char>) = (pat.chars().collect(), name.chars().collect());
    let (mut pi, mut ni, mut star, mut mark) = (0, 0, None, 0);
    while ni < n.len() {
        if pi < p.len() && (p[pi] == '?' || p[pi] == n[ni]) {
            pi += 1;
            ni += 1;
        } else if pi < p.len() && p[pi] == '*' {
            star = Some(pi);
            mark = ni;
            pi += 1;
        } else if let Some(s) = star {
            pi = s + 1;
            mark += 1;
            ni = mark;
        } else {
            return false;
        }
    }
    p[pi..].iter().all(|&c| c == '*')
}

/// Ask OpenSSH what an alias resolves to. Local only, no network.
pub fn resolve(alias: &str) -> AppResult<ResolvedHost> {
    validate_ssh_alias(alias)?;
    let out = Command::new(SSH_BIN)
        .args(base_args())
        .args(["-G", "--", alias])
        .output()
        .map_err(|e| AppError::Shell(format!("couldn't start ssh: {e}")))?;
    if !out.status.success() {
        return Err(AppError::Shell(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    parse_ssh_g(&String::from_utf8_lossy(&out.stdout))
}

/// Group aliases that reach the same `(hostname, user, port)`: one `Host` line
/// often carries several names for one server (`Host prod prod.old`). Groups
/// keep file order; the first alias in each is the one to show.
pub fn group_by_target(resolved: Vec<(String, ResolvedHost)>) -> Vec<(Vec<String>, ResolvedHost)> {
    let mut groups: Vec<(Vec<String>, ResolvedHost)> = Vec::new();
    for (alias, r) in resolved {
        match groups
            .iter_mut()
            .find(|(_, g)| g.hostname == r.hostname && g.user == r.user && g.port == r.port)
        {
            Some((aliases, _)) => aliases.push(alias),
            None => groups.push((vec![alias], r)),
        }
    }
    groups
}

pub fn parse_ssh_g(out: &str) -> AppResult<ResolvedHost> {
    let mut hostname = None;
    let mut user = None;
    let mut port = None;
    let mut proxy_jump = None;
    let mut identity_files = Vec::new();
    for line in out.lines() {
        let Some((k, v)) = line.split_once(' ') else {
            continue;
        };
        let v = v.trim();
        match k {
            "hostname" => hostname = Some(v.to_string()),
            "user" => user = Some(v.to_string()),
            "port" => port = v.parse().ok(),
            "proxyjump" if v != "none" => proxy_jump = Some(v.to_string()),
            "identityfile" => identity_files.push(v.to_string()),
            _ => {}
        }
    }
    match (hostname, user, port) {
        (Some(hostname), Some(user), Some(port)) => Ok(ResolvedHost {
            hostname,
            user,
            port,
            proxy_jump,
            identity_files,
        }),
        _ => Err(AppError::Parse("unexpected `ssh -G` output".into())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// A fake home with `.ssh/`, so tests never touch the real one.
    fn fake_ssh(name: &str) -> PathBuf {
        let home = std::env::temp_dir().join(format!("nexus-sshcfg-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&home);
        fs::create_dir_all(home.join(".ssh/config.d")).unwrap();
        home.join(".ssh")
    }

    #[test]
    fn lists_concrete_aliases_and_skips_patterns() {
        let ssh = fake_ssh("basic");
        fs::write(
            ssh.join("config"),
            "# comment\nHost *\n  ServerAliveInterval 30\n\
             Host fameo-dev fameo-staging\n  HostName 10.0.0.1\n\
             host=fameo-prod\n\
             HOST web-? !bastion db-*\n\
             Host \"quoted-host\" # trailing comment\n\
             Match host foo\n  User bar\n\
             Host fameo-dev\n",
        )
        .unwrap();
        assert_eq!(
            list_config_aliases(&ssh.join("config"), &ssh),
            ["fameo-dev", "fameo-staging", "fameo-prod", "quoted-host"]
        );
    }

    #[test]
    fn follows_includes_relative_tilde_and_globs_in_order() {
        let ssh = fake_ssh("include");
        fs::write(
            ssh.join("config"),
            "Include config.d/*\nHost main\nInclude ~/.ssh/extra\n",
        )
        .unwrap();
        fs::write(ssh.join("config.d/20-b"), "Host b-host\n").unwrap();
        fs::write(ssh.join("config.d/10-a"), "Host a-host\n").unwrap();
        fs::write(ssh.join("config.d/.hidden"), "Host hidden\n").unwrap();
        fs::write(ssh.join("extra"), "Include=nested\n").unwrap();
        fs::write(ssh.join("nested"), "Host nested-host\n").unwrap();
        assert_eq!(
            list_config_aliases(&ssh.join("config"), &ssh),
            ["a-host", "b-host", "main", "nested-host"]
        );
    }

    #[test]
    fn include_cycles_and_depth_are_bounded() {
        let ssh = fake_ssh("cycle");
        fs::write(ssh.join("config"), "Host top\nInclude loop\n").unwrap();
        fs::write(
            ssh.join("loop"),
            "Host looped\nInclude config\nInclude loop\n",
        )
        .unwrap();
        assert_eq!(
            list_config_aliases(&ssh.join("config"), &ssh),
            ["top", "looped"]
        );

        // config → d1 → … → d7: only depths 1..=5 are followed.
        let ssh = fake_ssh("depth");
        fs::write(ssh.join("config"), "Include d1\n").unwrap();
        for i in 1..=7 {
            fs::write(
                ssh.join(format!("d{i}")),
                format!("Host h{i}\nInclude d{}\n", i + 1),
            )
            .unwrap();
        }
        assert_eq!(
            list_config_aliases(&ssh.join("config"), &ssh),
            ["h1", "h2", "h3", "h4", "h5"]
        );
    }

    #[test]
    fn missing_config_is_empty() {
        let ssh = fake_ssh("none");
        assert!(list_config_aliases(&ssh.join("config"), &ssh).is_empty());
    }

    #[test]
    fn glob_matching() {
        assert!(glob_match("*", "anything"));
        assert!(glob_match("*.conf", "work.conf"));
        assert!(!glob_match("*.conf", "work.conf.bak"));
        assert!(glob_match("h?st", "host"));
        assert!(!glob_match("h?st", "hst"));
        assert!(glob_match("a*b*c", "axxbyyc"));
    }

    // `ssh -G -F /dev/null somehost` on OpenSSH_10.3p1 (trimmed to the keys we
    // read plus neighbours), 2026-10-20.
    const SSH_G: &str =
        "host somehost\nuser devarpit\nhostname somehost\nport 22\naddressfamily any\n\
        batchmode no\nidentityfile ~/.ssh/id_rsa\nidentityfile ~/.ssh/id_ecdsa\n\
        identityfile ~/.ssh/id_ed25519\nproxyjump none\n";

    #[test]
    fn parses_ssh_g() {
        let r = parse_ssh_g(SSH_G).unwrap();
        assert_eq!(r.hostname, "somehost");
        assert_eq!(r.user, "devarpit");
        assert_eq!(r.port, 22);
        assert_eq!(r.proxy_jump, None);
        assert_eq!(r.identity_files.len(), 3);

        let jumped = SSH_G
            .replace("proxyjump none", "proxyjump bastion")
            .replace("port 22", "port 2222");
        let r = parse_ssh_g(&jumped).unwrap();
        assert_eq!(r.proxy_jump.as_deref(), Some("bastion"));
        assert_eq!(r.port, 2222);

        assert!(parse_ssh_g("garbage").is_err());
    }

    #[test]
    fn groups_aliases_of_the_same_server() {
        let host = |hostname: &str, user: &str| ResolvedHost {
            hostname: hostname.into(),
            user: user.into(),
            port: 22,
            proxy_jump: None,
            identity_files: vec![],
        };
        let groups = group_by_target(vec![
            ("Vip-Prod".into(), host("i-07ef", "ec2-user")),
            ("vip-prod".into(), host("i-07ef", "ec2-user")),
            ("Vip-Dev".into(), host("i-023a", "ec2-user")),
            ("vip.prod".into(), host("i-07ef", "ec2-user")),
            ("vip-prod-root".into(), host("i-07ef", "root")),
        ]);
        let aliases: Vec<_> = groups.iter().map(|(a, _)| a.clone()).collect();
        assert_eq!(
            aliases,
            [
                vec!["Vip-Prod", "vip-prod", "vip.prod"],
                vec!["Vip-Dev"],
                vec!["vip-prod-root"],
            ]
        );
    }

    #[test]
    fn resolve_rejects_flag_like_aliases_before_spawning() {
        assert!(matches!(
            resolve("-oProxyCommand=x"),
            Err(AppError::InvalidName(_))
        ));
    }
}
