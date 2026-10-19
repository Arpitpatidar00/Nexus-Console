// Parsers for probe.sh output, one file per area. Every parser is total: bad
// input yields an empty/`None` value (plus a warning from the caller), never a
// panic and never a failed snapshot (docs/remote/PLAN.md §4.6).

pub mod disk;
pub mod docker;
pub mod journal;
pub mod mem;
pub mod pm2;
pub mod ports;
pub mod system;
pub mod systemd;

use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Section {
    Ok(String),
    Absent,
    /// The tool exists but failed; carries its first stderr line.
    Error(String),
}

#[derive(Debug, Default)]
pub struct Sections {
    map: HashMap<String, Section>,
    /// `@@NX:end@@` was seen: the probe ran to completion.
    pub complete: bool,
}

impl Sections {
    pub fn get(&self, name: &str) -> Option<&Section> {
        self.map.get(name)
    }

    /// The body of a section that ran fine.
    pub fn ok(&self, name: &str) -> Option<&str> {
        match self.map.get(name) {
            Some(Section::Ok(body)) => Some(body),
            _ => None,
        }
    }
}

const MARK: &str = "@@NX:";

/// Split on `@@NX:<name>[:absent|:error]@@` marker lines.
pub fn split_sections(out: &str) -> Sections {
    let mut s = Sections::default();
    let mut current: Option<(String, &str)> = None;
    let mut body: Vec<&str> = Vec::new();
    let flush = |cur: Option<(String, &str)>, body: &mut Vec<&str>, s: &mut Sections| {
        if let Some((name, kind)) = cur {
            let text = body.join("\n");
            let sec = match kind {
                "absent" => Section::Absent,
                "error" => {
                    Section::Error(text.lines().next().unwrap_or("failed").trim().to_string())
                }
                _ => Section::Ok(text),
            };
            s.map.entry(name).or_insert(sec);
        }
        body.clear();
    };
    for line in out.lines() {
        let marker = line
            .trim_end()
            .strip_prefix(MARK)
            .and_then(|m| m.strip_suffix("@@"));
        match marker {
            Some("end") => {
                flush(current.take(), &mut body, &mut s);
                s.complete = true;
            }
            Some(m) => {
                flush(current.take(), &mut body, &mut s);
                let (name, kind) = m.split_once(':').unwrap_or((m, ""));
                current = Some((name.to_string(), kind));
            }
            None => body.push(line),
        }
    }
    flush(current, &mut body, &mut s);
    s
}

/// `key=value` lines into a map (meta/uptime sections, os-release).
pub fn kv_lines(body: &str) -> HashMap<&str, &str> {
    body.lines()
        .filter_map(|l| l.split_once('='))
        .map(|(k, v)| (k.trim(), v.trim()))
        .collect()
}

/// Docker's human sizes: `7.789MiB`, `12.3kB`, `0B`, `4.801GiB`.
pub fn human_bytes(s: &str) -> Option<u64> {
    let s = s.trim();
    let split = s.find(|c: char| !(c.is_ascii_digit() || c == '.'))?;
    let (num, unit) = s.split_at(split);
    let n: f64 = num.parse().ok()?;
    let mult: f64 = match unit {
        "B" => 1.0,
        "kB" | "KB" => 1e3,
        "MB" => 1e6,
        "GB" => 1e9,
        "TB" => 1e12,
        "KiB" => 1024.0,
        "MiB" => 1024.0 * 1024.0,
        "GiB" => 1024.0 * 1024.0 * 1024.0,
        "TiB" => 1024.0 * 1024.0 * 1024.0 * 1024.0,
        _ => return None,
    };
    Some((n * mult).round() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_ok_absent_error_and_end() {
        let s = split_sections(
            "@@NX:meta@@\nhostname=a\nuname=Linux\n@@NX:docker:error@@\npermission denied\nmore\n\
             @@NX:pm2:absent@@\n@@NX:failed@@\n@@NX:end@@\n",
        );
        assert!(s.complete);
        assert_eq!(s.ok("meta"), Some("hostname=a\nuname=Linux"));
        assert_eq!(
            s.get("docker"),
            Some(&Section::Error("permission denied".into()))
        );
        assert_eq!(s.get("pm2"), Some(&Section::Absent));
        assert_eq!(s.ok("failed"), Some(""));
        assert_eq!(s.get("nope"), None);
    }

    #[test]
    fn truncated_output_is_incomplete() {
        let s = split_sections("@@NX:meta@@\nhostname=a\n@@NX:mem@@\nMemTotal: 1 kB");
        assert!(!s.complete);
        assert_eq!(s.ok("mem"), Some("MemTotal: 1 kB"));
    }

    #[test]
    fn garbage_is_empty_not_a_panic() {
        let s = split_sections("fish: Unknown command\n\u{0}\u{1}");
        assert!(!s.complete);
        assert!(s.ok("meta").is_none());
    }

    #[test]
    fn docker_human_sizes() {
        assert_eq!(human_bytes("0B"), Some(0));
        assert_eq!(human_bytes("12.3kB"), Some(12_300));
        assert_eq!(human_bytes("1MiB"), Some(1_048_576));
        assert_eq!(human_bytes("7.789MiB"), Some(8_167_358));
        assert_eq!(human_bytes("--"), None);
        assert_eq!(human_bytes("12XB"), None);
    }
}
