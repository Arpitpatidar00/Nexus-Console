// Rolling 90-day storage and swap trends for Mac Clean (P9.4).
// Persisted in maclean-history.json. Calculates week-over-week deltas and top growing categories.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const MAX_HISTORY_DAYS: usize = 90;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TrendRecord {
    pub date: String, // YYYY-MM-DD
    pub timestamp: u64,
    pub free_disk_bytes: u64,
    pub total_disk_bytes: u64,
    pub swap_used_bytes: u64,
    pub categories: HashMap<String, u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryDelta {
    pub category: String,
    pub delta_bytes: i64,
    pub current_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrendsReport {
    pub records: Vec<TrendRecord>,
    pub weekly_free_delta_bytes: i64,
    pub biggest_growers: Vec<CategoryDelta>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TrendStore {
    pub entries: Vec<TrendRecord>,
}

impl TrendStore {
    pub fn load(path: &Path) -> Self {
        crate::core::store::load_store(path)
    }

    pub fn save(&self, path: &Path) -> crate::error::AppResult<()> {
        crate::core::store::save_store(path, self, false)
    }

    pub fn record(&mut self, record: TrendRecord) {
        if let Some(existing) = self.entries.iter_mut().find(|r| r.date == record.date) {
            *existing = record;
        } else {
            self.entries.push(record);
        }
        self.entries.sort_by_key(|r| r.timestamp);
        if self.entries.len() > MAX_HISTORY_DAYS {
            let excess = self.entries.len() - MAX_HISTORY_DAYS;
            self.entries.drain(0..excess);
        }
    }

    pub fn report(&self) -> TrendsReport {
        if self.entries.is_empty() {
            return TrendsReport {
                records: Vec::new(),
                weekly_free_delta_bytes: 0,
                biggest_growers: Vec::new(),
            };
        }

        let current = self.entries.last().unwrap();
        // Look back ~7 entries or the first available
        let week_ago = if self.entries.len() >= 7 {
            &self.entries[self.entries.len() - 7]
        } else {
            &self.entries[0]
        };

        let weekly_free_delta_bytes =
            current.free_disk_bytes as i64 - week_ago.free_disk_bytes as i64;

        let mut growers = Vec::new();
        for (cat, &curr_val) in &current.categories {
            let prev_val = week_ago.categories.get(cat).copied().unwrap_or(0);
            let delta = curr_val as i64 - prev_val as i64;
            growers.push(CategoryDelta {
                category: cat.clone(),
                delta_bytes: delta,
                current_bytes: curr_val,
            });
        }

        // Sort descending by delta_bytes
        growers.sort_by_key(|b| -b.delta_bytes);

        TrendsReport {
            records: self.entries.clone(),
            weekly_free_delta_bytes,
            biggest_growers: growers,
        }
    }
}

pub fn history_path(base_dir: &Path) -> PathBuf {
    base_dir.join("maclean-history.json")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_trend_store_record_and_delta() {
        let mut store = TrendStore::default();
        let mut cat1 = HashMap::new();
        cat1.insert("node_modules".to_string(), 10_000_000_000);
        cat1.insert("caches".to_string(), 5_000_000_000);

        store.record(TrendRecord {
            date: "2026-10-14".to_string(),
            timestamp: 1728864000,
            free_disk_bytes: 50_000_000_000,
            total_disk_bytes: 500_000_000_000,
            swap_used_bytes: 0,
            categories: cat1,
        });

        let mut cat2 = HashMap::new();
        cat2.insert("node_modules".to_string(), 14_000_000_000);
        cat2.insert("caches".to_string(), 4_000_000_000);

        store.record(TrendRecord {
            date: "2026-10-21".to_string(),
            timestamp: 1729468800,
            free_disk_bytes: 46_000_000_000,
            total_disk_bytes: 500_000_000_000,
            swap_used_bytes: 500_000_000,
            categories: cat2,
        });

        let rep = store.report();
        assert_eq!(rep.records.len(), 2);
        assert_eq!(rep.weekly_free_delta_bytes, -4_000_000_000); // 4 GB less free space
        assert_eq!(rep.biggest_growers[0].category, "node_modules");
        assert_eq!(rep.biggest_growers[0].delta_bytes, 4_000_000_000);
    }
}
