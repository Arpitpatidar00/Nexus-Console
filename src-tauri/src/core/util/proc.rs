use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Default)]
pub struct ProcessInfo {
    pub pid: u32,
    pub ppid: u32,
    pub tty: String,
    pub comm: String,
    pub cwd: Option<PathBuf>,
}

/// Known dev binaries / runtime engines
const DEV_BINARIES: &[&str] = &[
    "node",
    "bun",
    "deno",
    "python",
    "python3",
    "ruby",
    "java",
    "next-server",
    "vite",
    "cargo",
    "go",
    "flask",
    "uvicorn",
    "gunicorn",
];

/// Determines if command represents a dev binary
pub fn is_dev_binary(comm: &str) -> bool {
    let lower = comm.to_lowercase();
    let file_name = Path::new(&lower)
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or(&lower);

    DEV_BINARIES
        .iter()
        .any(|&b| file_name == b || file_name.starts_with(b))
        || file_name.ends_with("-server")
        || file_name.ends_with("-dev")
}

/// A listener is Detached when:
/// 1. parent pid is 1 (orphaned);
/// 2. no controlling tty (? or ??);
/// 3. binary is in the dev set;
/// 4. not a known Homebrew service pid, not in /Applications or /System.
pub fn is_detached(
    ppid: u32,
    tty: &str,
    comm: &str,
    cwd: Option<&Path>,
    brew_pids: &[u32],
) -> bool {
    if ppid != 1 {
        return false;
    }
    let tty_clean = tty.trim();
    if tty_clean != "?" && tty_clean != "??" && !tty_clean.is_empty() {
        return false;
    }
    if !is_dev_binary(comm) {
        return false;
    }
    if brew_pids.contains(&ppid) {
        return false;
    }
    if let Some(path) = cwd {
        let path_str = path.to_string_lossy();
        if path_str.starts_with("/Applications") || path_str.starts_with("/System") {
            return false;
        }
    }
    true
}

/// Extract project name from a working directory path
pub fn project_name_from_cwd(cwd: &Path) -> Option<String> {
    cwd.file_name().map(|n| n.to_string_lossy().to_string())
}

/// Query process cwd using `lsof -a -p <pid> -d cwd -Fn`
pub fn get_process_cwds(pids: &[u32]) -> HashMap<u32, PathBuf> {
    if pids.is_empty() {
        return HashMap::new();
    }
    let pids_str: Vec<String> = pids.iter().map(u32::to_string).collect();
    let out = Command::new("lsof")
        .args(["-a", "-p", &pids_str.join(","), "-d", "cwd", "-Fn"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default();

    parse_lsof_cwd(&out)
}

pub fn parse_lsof_cwd(out: &str) -> HashMap<u32, PathBuf> {
    let mut map = HashMap::new();
    let mut current_pid = 0u32;
    for line in out.lines() {
        if let Some(p) = line.strip_prefix('p') {
            current_pid = p.parse().unwrap_or(0);
        } else if let Some(n) = line.strip_prefix('n') {
            if current_pid > 0 {
                map.insert(current_pid, PathBuf::from(n));
            }
        }
    }
    map
}

/// Query process table via `ps -o pid=,ppid=,tty=,comm= -p <pids>`
pub fn get_process_table(pids: &[u32]) -> HashMap<u32, ProcessInfo> {
    if pids.is_empty() {
        return HashMap::new();
    }
    let pids_str: Vec<String> = pids.iter().map(u32::to_string).collect();
    let out = Command::new("ps")
        .args(["-o", "pid=,ppid=,tty=,comm=", "-p", &pids_str.join(",")])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default();

    parse_ps_table(&out)
}

pub fn parse_ps_table(out: &str) -> HashMap<u32, ProcessInfo> {
    let mut map = HashMap::new();
    for line in out.lines() {
        let f: Vec<&str> = line.split_whitespace().collect();
        if f.len() < 4 {
            continue;
        }
        let (Ok(pid), Ok(ppid)) = (f[0].parse::<u32>(), f[1].parse::<u32>()) else {
            continue;
        };
        let tty = f[2].to_string();
        let comm = f[3..].join(" ");
        map.insert(
            pid,
            ProcessInfo {
                pid,
                ppid,
                tty,
                comm,
                cwd: None,
            },
        );
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_detached_dev_process() {
        assert!(is_detached(
            1,
            "?",
            "node",
            Some(Path::new("/Users/dev/code/my-app")),
            &[]
        ));
        assert!(is_detached(
            1,
            "??",
            "bun",
            Some(Path::new("/Users/dev/code/api")),
            &[]
        ));
        assert!(is_detached(
            1,
            "?",
            "python3",
            Some(Path::new("/Users/dev/code/worker")),
            &[]
        ));
    }

    #[test]
    fn rejects_attached_or_system_processes() {
        // Attached to terminal
        assert!(!is_detached(
            1,
            "ttys001",
            "node",
            Some(Path::new("/Users/dev/code/my-app")),
            &[]
        ));
        // Normal parent process
        assert!(!is_detached(
            452,
            "?",
            "node",
            Some(Path::new("/Users/dev/code/my-app")),
            &[]
        ));
        // System application
        assert!(!is_detached(
            1,
            "?",
            "node",
            Some(Path::new("/Applications/Slack.app")),
            &[]
        ));
        // Non-dev binary
        assert!(!is_detached(
            1,
            "?",
            "launchd",
            Some(Path::new("/System/Library")),
            &[]
        ));
    }

    #[test]
    fn parses_lsof_cwd_output() {
        let raw = "p1234\nn/Users/dev/projects/my-app\np5678\nn/Users/dev/projects/backend\n";
        let map = parse_lsof_cwd(raw);
        assert_eq!(
            map.get(&1234).unwrap(),
            Path::new("/Users/dev/projects/my-app")
        );
        assert_eq!(
            map.get(&5678).unwrap(),
            Path::new("/Users/dev/projects/backend")
        );
        assert_eq!(
            project_name_from_cwd(map.get(&1234).unwrap()),
            Some("my-app".into())
        );
    }
}
