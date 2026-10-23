pub mod discovery;
pub mod git;
pub mod github;
pub mod runner;
pub mod store;

use std::path::PathBuf;
use std::sync::Mutex;

pub struct ProjectsState {
    pub path: PathBuf,
    pub store: Mutex<store::ProjectsStore>,
}

impl ProjectsState {
    pub fn load(path: PathBuf) -> Self {
        let parent = path.parent().unwrap_or(&path);
        Self {
            store: Mutex::new(store::ProjectsStore::load(parent)),
            path,
        }
    }
}
