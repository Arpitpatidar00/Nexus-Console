pub mod apfs;
pub mod classifier;
pub mod discovery;
pub mod store;

use std::path::PathBuf;
use std::sync::Mutex;

pub struct DatabaseState {
    pub path: PathBuf,
    pub store: Mutex<store::DbStore>,
}

impl DatabaseState {
    pub fn load(path: PathBuf) -> Self {
        let parent = path.parent().unwrap_or(&path);
        Self {
            store: Mutex::new(store::DbStore::load(parent)),
            path,
        }
    }
}
