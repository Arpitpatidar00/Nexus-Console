use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

const FILE_NAME: &str = "remote-runbooks.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RunbookItem {
    pub id: String,
    pub host_id: Option<String>,
    pub project: Option<String>,
    pub name: String,
    pub command: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RunbookStore {
    #[serde(default)]
    pub items: Vec<RunbookItem>,
}

pub fn new_runbook_id() -> String {
    use std::io::Read;
    let mut buf = [0u8; 8];
    if fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut buf))
        .is_err()
    {
        let n = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos() as u64);
        buf = n.to_le_bytes();
    }
    let hex: String = buf.iter().map(|b| format!("{b:02x}")).collect();
    format!("rb_{hex}")
}

impl RunbookStore {
    pub fn load(dir: &Path) -> Self {
        let path = dir.join(FILE_NAME);
        let Ok(raw) = fs::read_to_string(&path) else {
            return Self::default();
        };
        serde_json::from_str(&raw).unwrap_or_default()
    }

    pub fn save(&self, dir: &Path) -> AppResult<()> {
        let path = dir.join(FILE_NAME);
        let io = |e: std::io::Error| AppError::Io(format!("saving {FILE_NAME}: {e}"));
        let json = serde_json::to_vec_pretty(self)
            .map_err(|e| AppError::Parse(format!("serializing {FILE_NAME}: {e}")))?;
        let tmp = path.with_extension("json.tmp");
        fs::write(&tmp, json).map_err(io)?;
        fs::rename(&tmp, &path).map_err(io)
    }

    pub fn list(&self, host_id: Option<&str>, project: Option<&str>) -> Vec<RunbookItem> {
        self.items
            .iter()
            .filter(|rb| {
                if let Some(h) = host_id {
                    if rb.host_id.as_deref() == Some(h) {
                        return true;
                    }
                }
                if let Some(p) = project {
                    if rb.project.as_deref() == Some(p) {
                        return true;
                    }
                }
                rb.host_id.is_none() && rb.project.is_none()
            })
            .cloned()
            .collect()
    }

    pub fn add(&mut self, item: RunbookItem) {
        self.items.push(item);
    }

    pub fn remove(&mut self, id: &str) -> Option<RunbookItem> {
        if let Some(pos) = self.items.iter().position(|r| r.id == id) {
            Some(self.items.remove(pos))
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_runbook_id_generation() {
        let id1 = new_runbook_id();
        let id2 = new_runbook_id();
        assert!(id1.starts_with("rb_"));
        assert_ne!(id1, id2);
    }
}
