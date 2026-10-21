// One centralized, robust store implementation for Stackroost (A-04).
// Guarantees:
// 1. Atomic writes via sibling temp file + rename.
// 2. Schema versioning tracking.
// 3. Corrupt-file backup: corrupt files are preserved with a .corrupt suffix instead of destroyed.
// 4. Sensitive mode: sets 0600 file permissions on macOS.

use crate::core::error::{AppError, AppResult};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionedStore<T> {
    pub version: u32,
    pub data: T,
}

pub struct StoreOptions {
    pub version: u32,
    pub sensitive: bool,
}

impl Default for StoreOptions {
    fn default() -> Self {
        Self {
            version: 1,
            sensitive: false,
        }
    }
}

impl StoreOptions {
    pub fn sensitive(mut self) -> Self {
        self.sensitive = true;
        self
    }

    pub fn with_version(mut self, version: u32) -> Self {
        self.version = version;
        self
    }
}

/// Generic store interface that manages atomic writes, permissions, and corruption recovery.
pub struct FileStore<T> {
    path: PathBuf,
    options: StoreOptions,
    _marker: std::marker::PhantomData<T>,
}

impl<T: Serialize + DeserializeOwned + Default + Clone> FileStore<T> {
    pub fn new(path: impl Into<PathBuf>, options: StoreOptions) -> Self {
        Self {
            path: path.into(),
            options,
            _marker: std::marker::PhantomData,
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Load the data from disk. If the file does not exist, returns Default.
    /// If the file is corrupt, backs it up to `.corrupt` and returns Default.
    pub fn load(&self) -> T {
        if !self.path.exists() {
            return T::default();
        }

        let content = match fs::read_to_string(&self.path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Warning: failed to read store at {:?}: {e}", self.path);
                self.backup_corrupt();
                return T::default();
            }
        };

        // First attempt to parse as VersionedStore<T>
        if let Ok(versioned) = serde_json::from_str::<VersionedStore<T>>(&content) {
            return versioned.data;
        }

        // Fallback: parse directly as T for backwards compatibility with raw stores
        if let Ok(direct) = serde_json::from_str::<T>(&content) {
            return direct;
        }

        // If both failed, the file is corrupted
        eprintln!(
            "Warning: store file corrupted at {:?}, creating backup",
            self.path
        );
        self.backup_corrupt();
        T::default()
    }

    /// Atomically save the data to disk using sibling temp file and rename.
    pub fn save(&self, data: &T) -> AppResult<()> {
        let parent = self.path.parent().ok_or_else(|| {
            AppError::Io(format!(
                "Invalid store path without parent: {:?}",
                self.path
            ))
        })?;

        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| {
                AppError::Io(format!(
                    "Failed to create store dir {:?}: {e}",
                    parent.display()
                ))
            })?;
            if self.options.sensitive {
                let _ = fs::set_permissions(parent, fs::Permissions::from_mode(0o700));
            }
        }

        let versioned = VersionedStore {
            version: self.options.version,
            data: data.clone(),
        };

        let json = serde_json::to_vec_pretty(&versioned)
            .map_err(|e| AppError::Parse(format!("Failed to serialize store data: {e}")))?;

        // Unique temp file name to avoid collisions across processes/threads
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let tmp_path = parent.join(format!(
            ".tmp_{}_{}",
            self.path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("store"),
            nonce
        ));

        fs::write(&tmp_path, json).map_err(|e| {
            AppError::Io(format!(
                "Failed to write temp store {:?}: {e}",
                tmp_path.display()
            ))
        })?;

        if self.options.sensitive {
            if let Err(e) = fs::set_permissions(&tmp_path, fs::Permissions::from_mode(0o600)) {
                eprintln!(
                    "Warning: failed to set 0600 permissions on {:?}: {e}",
                    tmp_path
                );
            }
        }

        fs::rename(&tmp_path, &self.path).map_err(|e| {
            let _ = fs::remove_file(&tmp_path);
            AppError::Io(format!(
                "Failed to atomic-rename store {:?} -> {:?}: {e}",
                tmp_path, self.path
            ))
        })?;

        Ok(())
    }

    fn backup_corrupt(&self) {
        let epoch = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let corrupt_path = self.path.with_extension(format!("corrupt.{epoch}"));
        let _ = fs::rename(&self.path, &corrupt_path);
    }
}

/// Helper function to load any serializable store data with corruption handling.
pub fn load_store<T: Serialize + DeserializeOwned + Default + Clone>(path: impl AsRef<Path>) -> T {
    let store = FileStore::<T>::new(path.as_ref().to_path_buf(), StoreOptions::default());
    store.load()
}

/// Helper function to atomically save any serializable store data.
pub fn save_store<T: Serialize + DeserializeOwned + Default + Clone>(
    path: impl AsRef<Path>,
    data: &T,
    sensitive: bool,
) -> AppResult<()> {
    let mut opts = StoreOptions::default();
    if sensitive {
        opts = opts.sensitive();
    }
    let store = FileStore::<T>::new(path.as_ref().to_path_buf(), opts);
    store.save(data)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
    struct DummyData {
        title: String,
        count: u64,
    }

    fn tmp_dir(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "stackroost_store_test_{name}_{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn test_store_atomic_roundtrip() {
        let dir = tmp_dir("roundtrip");
        let path = dir.join("test_store.json");
        let store = FileStore::new(&path, StoreOptions::default());

        assert_eq!(store.load(), DummyData::default());

        let data = DummyData {
            title: "Stackroost".into(),
            count: 42,
        };
        store.save(&data).unwrap();

        let loaded = store.load();
        assert_eq!(loaded, data);
        assert!(path.exists());
    }

    #[test]
    fn test_store_sensitive_permissions() {
        let dir = tmp_dir("sensitive");
        let path = dir.join("sensitive_store.json");
        let store = FileStore::new(&path, StoreOptions::default().sensitive());

        let data = DummyData {
            title: "Private".into(),
            count: 7,
        };
        store.save(&data).unwrap();

        let meta = fs::metadata(&path).unwrap();
        let mode = meta.permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }

    #[test]
    fn test_store_corrupt_file_backup() {
        let dir = tmp_dir("corrupt");
        let path = dir.join("corrupt_store.json");

        // Write junk into store
        fs::write(&path, "{ not valid json here :::").unwrap();

        let store = FileStore::<DummyData>::new(&path, StoreOptions::default());
        let loaded = store.load();

        // Must return default, original junk must be renamed, not deleted
        assert_eq!(loaded, DummyData::default());
        assert!(!path.exists());

        let entries: Vec<_> = fs::read_dir(&dir).unwrap().filter_map(|e| e.ok()).collect();
        assert!(entries
            .iter()
            .any(|e| e.file_name().to_string_lossy().contains("corrupt")));
    }
}
