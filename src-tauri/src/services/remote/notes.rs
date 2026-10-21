use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

const FILE_NAME: &str = "remote-notes.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HostNote {
    pub host_id: String,
    pub content: String,
    pub updated_at_epoch: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NotesStore {
    #[serde(default)]
    pub notes: HashMap<String, HostNote>,
}

impl NotesStore {
    pub fn load(dir: &Path) -> Self {
        crate::core::store::load_store(dir.join(FILE_NAME))
    }

    pub fn save(&self, dir: &Path) -> AppResult<()> {
        crate::core::store::save_store(dir.join(FILE_NAME), self, true)
    }

    pub fn get(&self, host_id: &str) -> HostNote {
        self.notes
            .get(host_id)
            .cloned()
            .unwrap_or_else(|| HostNote {
                host_id: host_id.to_string(),
                content: String::new(),
                updated_at_epoch: 0,
            })
    }

    pub fn set(&mut self, host_id: &str, content: String) -> HostNote {
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let note = HostNote {
            host_id: host_id.to_string(),
            content,
            updated_at_epoch: now,
        };
        self.notes.insert(host_id.to_string(), note.clone());
        note
    }
}

pub fn path_in(app_data_dir: PathBuf) -> PathBuf {
    app_data_dir.join(FILE_NAME)
}
