// Disk measurement: `du` that can be cancelled mid-walk (the child is killed,
// not waited out), plus small filesystem walks that need no subprocess.
// Read-only by construction: nothing here writes.

use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

/// `du -sk` over several paths (missing ones skipped), summed, in bytes.
/// `ignore` names are passed as `-I` masks (BSD du: skip any entry with that
/// name). Unreadable subtrees just don't count; du keeps going. `None` only
/// when cancelled.
pub fn du(paths: &[&Path], ignore: &[&str], cancel: &AtomicBool) -> Option<u64> {
    let existing: Vec<&Path> = paths.iter().copied().filter(|p| p.exists()).collect();
    if existing.is_empty() {
        return Some(0);
    }
    let mut cmd = Command::new("du");
    cmd.arg("-sk");
    for i in ignore {
        cmd.args(["-I", i]);
    }
    let mut child = cmd
        .args(existing)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    // Read concurrently so a long listing can't fill the pipe and stall du.
    let reader = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = std::io::Read::read_to_string(&mut stdout, &mut s);
        s
    });
    loop {
        if cancel.load(Ordering::Relaxed) {
            let _ = child.kill();
            let _ = child.wait();
            return None;
        }
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(_) => return Some(0),
        }
    }
    Some(sum_du_kb(&reader.join().unwrap_or_default()) * 1024)
}

/// First column of each `du -sk` line, summed (KB).
pub fn sum_du_kb(out: &str) -> u64 {
    out.lines()
        .filter_map(|l| l.split_whitespace().next()?.parse::<u64>().ok())
        .sum()
}

/// Bytes actually allocated to a file (sparse files like Docker.raw report a
/// far larger apparent size). 0 when missing or unreadable.
pub fn allocated(path: &Path) -> u64 {
    use std::os::unix::fs::MetadataExt;
    std::fs::metadata(path).map_or(0, |m| m.blocks() * 512)
}

/// Total size of regular files under `dir` last modified more than `days`
/// ago. Symlinks are not followed.
pub fn old_files_bytes(dir: &Path, days: u32, now: std::time::SystemTime) -> u64 {
    let cutoff = now - Duration::from_secs(u64::from(days) * 86_400);
    let mut total = 0;
    walk(dir, &mut |p, m| {
        if m.is_file() && m.modified().is_ok_and(|t| t < cutoff) {
            total += allocated(p);
        }
    });
    total
}

/// Depth-first walk without following symlinks.
pub fn walk(dir: &Path, f: &mut dyn FnMut(&Path, &std::fs::Metadata)) {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return;
    };
    for e in rd.flatten() {
        let p = e.path();
        let Ok(m) = std::fs::symlink_metadata(&p) else {
            continue;
        };
        if m.is_dir() {
            walk(&p, f);
        } else {
            f(&p, &m);
        }
    }
}

/// Anything under `dir` modified within the last `days`? Stops at the first hit.
pub fn touched_within(dir: &Path, days: u32, now: std::time::SystemTime) -> bool {
    let cutoff = now - Duration::from_secs(u64::from(days) * 86_400);
    fn go(dir: &Path, cutoff: std::time::SystemTime) -> bool {
        let Ok(rd) = std::fs::read_dir(dir) else {
            return false;
        };
        for e in rd.flatten() {
            let Ok(m) = std::fs::symlink_metadata(e.path()) else {
                continue;
            };
            if m.modified().is_ok_and(|t| t >= cutoff) || (m.is_dir() && go(&e.path(), cutoff)) {
                return true;
            }
        }
        false
    }
    go(dir, cutoff)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::SystemTime;

    fn tmp(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("maclean-measure-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn du_sums_paths_and_skips_missing() {
        let d = tmp("du");
        std::fs::create_dir_all(d.join("a")).unwrap();
        std::fs::write(d.join("a/f"), vec![1u8; 300_000]).unwrap();
        std::fs::create_dir_all(d.join("b/Containers")).unwrap();
        std::fs::write(d.join("b/Containers/f"), vec![1u8; 300_000]).unwrap();
        let never = AtomicBool::new(false);
        let a = du(&[&d.join("a")], &[], &never).unwrap();
        assert!(a >= 300_000, "{a}");
        let both = du(
            &[&d.join("a"), &d.join("b"), &d.join("missing")],
            &[],
            &never,
        )
        .unwrap();
        assert!(both >= 600_000);
        // -I skips the masked directory by name.
        let masked = du(&[&d.join("b")], &["Containers"], &never).unwrap();
        assert!(masked < 300_000, "{masked}");
        assert_eq!(du(&[&d.join("missing")], &[], &never), Some(0));
    }

    #[test]
    fn cancelled_du_returns_none() {
        let cancel = AtomicBool::new(true);
        assert_eq!(du(&[Path::new("/usr")], &[], &cancel), None);
    }

    #[test]
    fn du_output_parsing() {
        assert_eq!(
            sum_du_kb("24914364\t/Users/me/Library\n12\t/x\njunk\n"),
            24_914_376
        );
    }

    #[test]
    fn old_files_and_recent_activity() {
        let d = tmp("age");
        std::fs::create_dir_all(d.join("sub")).unwrap();
        std::fs::write(d.join("sub/new.log"), vec![1u8; 10_000]).unwrap();
        let now = SystemTime::now();
        assert_eq!(
            old_files_bytes(&d, 7, now),
            0,
            "nothing is older than a week yet"
        );
        // Seen from 30 days in the future, the file is old and the tree is idle.
        let later = now + Duration::from_secs(30 * 86_400);
        assert!(old_files_bytes(&d, 7, later) > 0);
        assert!(touched_within(&d, 7, now));
        assert!(!touched_within(&d, 7, later));
    }
}
