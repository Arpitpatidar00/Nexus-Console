// Duplicate file scanner for Mac Clean (P9.5).
// Scans Downloads, Desktop, and Documents for files >= 1 MB.
// Uses size grouping -> 64 KB partial BLAKE3 hash -> full BLAKE3 hash.
// Interactive review: user chooses which copies to send to .Trash.

use crate::services::maclean::clean::move_to_trash;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};

const MIN_SIZE_BYTES: u64 = 1_000_000; // 1 MB
const PARTIAL_READ_BYTES: usize = 65_536; // 64 KB

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateFile {
    pub path: String,
    pub size_bytes: u64,
    pub modified_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub hash: String,
    pub size_bytes: u64,
    pub files: Vec<DuplicateFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateReport {
    pub groups: Vec<DuplicateGroup>,
    pub total_reclaimable_bytes: u64,
    pub scanned_files_count: usize,
}

pub fn default_scan_directories(home: &Path) -> Vec<PathBuf> {
    vec![
        home.join("Downloads"),
        home.join("Desktop"),
        home.join("Documents"),
    ]
}

pub fn scan_duplicates(dirs: &[PathBuf]) -> DuplicateReport {
    let mut candidates: Vec<(PathBuf, u64, u64)> = Vec::new();

    for dir in dirs {
        if !dir.exists() {
            continue;
        }
        walk_files(dir, &mut candidates, 0);
    }

    let scanned_files_count = candidates.len();

    // 1. Group by exact file size
    let mut by_size: HashMap<u64, Vec<(PathBuf, u64)>> = HashMap::new();
    for (p, size, mtime) in candidates {
        by_size.entry(size).or_default().push((p, mtime));
    }

    type PartialKey = (u64, [u8; 32]);
    type FileEntry = (PathBuf, u64);
    // 2. Partial 64 KB hash for candidates with same size
    let mut by_partial_hash: HashMap<PartialKey, Vec<FileEntry>> = HashMap::new();
    for (&size, files) in &by_size {
        if files.len() < 2 {
            continue;
        }
        for (path, mtime) in files {
            if let Some(hash) = hash_partial(path) {
                by_partial_hash
                    .entry((size, hash))
                    .or_default()
                    .push((path.clone(), *mtime));
            }
        }
    }

    // 3. Full BLAKE3 hash for matching partial hash groups
    let mut groups = Vec::new();
    for ((size, _), files) in by_partial_hash {
        if files.len() < 2 {
            continue;
        }

        let mut by_full_hash: HashMap<String, Vec<DuplicateFile>> = HashMap::new();
        for (path, mtime) in files {
            if let Some(full_hash) = hash_full(&path) {
                by_full_hash
                    .entry(full_hash)
                    .or_default()
                    .push(DuplicateFile {
                        path: path.to_string_lossy().to_string(),
                        size_bytes: size,
                        modified_at: mtime,
                    });
            }
        }

        for (hash, dup_files) in by_full_hash {
            if dup_files.len() >= 2 {
                groups.push(DuplicateGroup {
                    hash,
                    size_bytes: size,
                    files: dup_files,
                });
            }
        }
    }

    // Sort groups descending by size
    groups.sort_by_key(|g| -(g.size_bytes as i64));

    let total_reclaimable_bytes = groups
        .iter()
        .map(|g| (g.files.len() as u64 - 1) * g.size_bytes)
        .sum();

    DuplicateReport {
        groups,
        total_reclaimable_bytes,
        scanned_files_count,
    }
}

fn walk_files(dir: &Path, list: &mut Vec<(PathBuf, u64, u64)>, depth: usize) {
    if depth > 8 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        let Ok(meta) = fs::symlink_metadata(&p) else {
            continue;
        };
        if meta.is_dir() {
            let name = p.file_name().unwrap_or_default().to_string_lossy();
            // Skip hidden directories and bundles
            if !name.starts_with('.') && !name.ends_with(".app") {
                walk_files(&p, list, depth + 1);
            }
        } else if meta.is_file() && meta.len() >= MIN_SIZE_BYTES {
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_secs());
            list.push((p, meta.len(), mtime));
        }
    }
}

fn hash_partial(path: &Path) -> Option<[u8; 32]> {
    let mut file = File::open(path).ok()?;
    let mut buf = [0u8; PARTIAL_READ_BYTES];
    let n = file.read(&mut buf).ok()?;
    let hash = blake3::hash(&buf[..n]);
    Some(*hash.as_bytes())
}

fn hash_full(path: &Path) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let mut hasher = blake3::Hasher::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = file.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Some(hasher.finalize().to_hex().to_string())
}

pub fn delete_duplicates(home: &Path, paths: &[String]) -> Result<u64, String> {
    let mut freed = 0;
    for path_str in paths {
        let path = PathBuf::from(path_str);
        if !path.exists() {
            continue;
        }
        let size = fs::metadata(&path).map_or(0, |m| m.len());
        move_to_trash(&path, home)?;
        freed += size;
    }
    Ok(freed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_duplicate_detection() {
        let tmp = std::env::temp_dir().join(format!("test_dups_{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        let content = vec![0x42u8; 1_200_000];
        let file_a = tmp.join("file_a.bin");
        let file_b = tmp.join("file_b.bin");
        let file_c = tmp.join("file_c.bin");

        fs::write(&file_a, &content).unwrap();
        fs::write(&file_b, &content).unwrap();
        fs::write(&file_c, vec![0x99u8; 1_200_000]).unwrap();

        let report = scan_duplicates(std::slice::from_ref(&tmp));
        assert_eq!(report.groups.len(), 1);
        assert_eq!(report.groups[0].files.len(), 2);
        assert_eq!(report.total_reclaimable_bytes, 1_200_000);

        let _ = fs::remove_dir_all(&tmp);
    }
}
