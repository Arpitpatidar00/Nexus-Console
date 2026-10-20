// External tools the report reads from. A Finder-launched app has no shell
// PATH, so each binary is looked up in its known install locations, and every
// call has a deadline (a wedged Docker daemon must not hang a scan).

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

pub fn find_bin(name: &str, home: &Path, brew_prefix: Option<&str>) -> Option<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Some(p) = brew_prefix {
        dirs.push(Path::new(p).join("bin"));
    }
    dirs.extend(
        ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"]
            .iter()
            .map(PathBuf::from),
    );
    dirs.push(home.join(".docker/bin"));
    dirs.push(home.join("Library/pnpm"));
    dirs.push(home.join(".local/share/pnpm"));
    dirs.into_iter().map(|d| d.join(name)).find(|p| p.is_file())
}

/// stdout of a successful run within `timeout`; `None` on failure or timeout
/// (the child is killed).
pub fn output(bin: &Path, args: &[&str], timeout: Duration) -> Option<String> {
    let mut child = Command::new(bin)
        .args(args)
        .env("HOMEBREW_NO_AUTO_UPDATE", "1")
        .env("HOMEBREW_NO_ENV_HINTS", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut out = child.stdout.take()?;
    let reader = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = std::io::Read::read_to_string(&mut out, &mut s);
        s
    });
    let until = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) if Instant::now() < until => std::thread::sleep(Duration::from_millis(20)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    };
    let text = reader.join().unwrap_or_default();
    status.success().then_some(text)
}

/// Is a macOS app running? Matches its main executable path, like the
/// script's `pgrep -f "<Name>.app/Contents/MacOS"`.
pub fn app_running(app: &str) -> bool {
    Command::new("/usr/bin/pgrep")
        .args(["-f", &format!("{app}.app/Contents/MacOS")])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|s| s.success())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_system_binaries_and_times_out() {
        let home = std::env::temp_dir();
        assert_eq!(
            find_bin("pgrep", &home, None),
            Some(PathBuf::from("/usr/bin/pgrep"))
        );
        assert_eq!(find_bin("definitely-not-a-tool", &home, None), None);
        assert_eq!(
            output(Path::new("/bin/echo"), &["hi"], Duration::from_secs(5)).as_deref(),
            Some("hi\n")
        );
        assert_eq!(
            output(Path::new("/bin/sleep"), &["5"], Duration::from_millis(200)),
            None
        );
        assert_eq!(
            output(Path::new("/usr/bin/false"), &[], Duration::from_secs(5)),
            None
        );
    }

    #[test]
    fn app_running_matches_bundle_executables_only() {
        assert!(!app_running("Surely No Such App 12345"));
    }
}
