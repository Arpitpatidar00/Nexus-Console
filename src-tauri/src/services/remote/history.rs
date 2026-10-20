use crate::error::{AppError, AppResult};
use crate::services::remote::probe::HostSnapshot;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

const FILE_NAME: &str = "remote-history.json";
const MAX_SUMMARIES_PER_HOST: usize = 50;

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotSummary {
    pub at_epoch: u64,
    pub container_names: Vec<String>,
    pub container_images: HashMap<String, String>,
    pub container_restarts: HashMap<String, u32>,
    pub disk_usage_pct: u8,
    pub failed_units: Vec<String>,
    pub critical_finding_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotDiff {
    pub added_containers: Vec<String>,
    pub removed_containers: Vec<String>,
    pub restarted_containers: Vec<String>,
    pub changed_images: Vec<(String, String, String)>,
    pub disk_growth_pct: Option<i16>,
    pub new_failed_units: Vec<String>,
    pub resolved_failed_units: Vec<String>,
    pub new_findings: Vec<String>,
    pub resolved_findings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Incident {
    pub id: String,
    pub host_id: String,
    pub title: String,
    pub opened_at_epoch: u64,
    pub resolved_at_epoch: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HostHistoryStore {
    #[serde(default)]
    pub summaries: HashMap<String, Vec<SnapshotSummary>>,
    #[serde(default)]
    pub incidents: Vec<Incident>,
}

pub fn summarize_snapshot(snap: &HostSnapshot) -> SnapshotSummary {
    let mut container_names = Vec::new();
    let mut container_images = HashMap::new();
    let mut container_restarts = HashMap::new();

    for c in &snap.containers {
        container_names.push(c.name.clone());
        container_images.insert(c.name.clone(), c.image.clone());
        container_restarts.insert(c.name.clone(), c.restart_count);
    }
    container_names.sort();

    let disk_usage_pct = snap
        .disks
        .iter()
        .filter_map(|d| (d.used_bytes * 100).checked_div(d.total_bytes))
        .map(|p| p as u8)
        .max()
        .unwrap_or(0);

    let mut failed_units: Vec<String> = snap.failed_units.iter().map(|u| u.unit.clone()).collect();
    failed_units.sort();

    let mut critical_finding_ids: Vec<String> = snap
        .findings
        .iter()
        .filter(|f| f.severity == crate::doctor::Severity::Red)
        .map(|f| f.id.to_string())
        .collect();
    critical_finding_ids.sort();

    SnapshotSummary {
        at_epoch: snap.captured_at,
        container_names,
        container_images,
        container_restarts,
        disk_usage_pct,
        failed_units,
        critical_finding_ids,
    }
}

pub fn diff_summaries(prev: &SnapshotSummary, curr: &SnapshotSummary) -> SnapshotDiff {
    let mut added_containers = Vec::new();
    for c in &curr.container_names {
        if !prev.container_names.contains(c) {
            added_containers.push(c.clone());
        }
    }

    let mut removed_containers = Vec::new();
    for c in &prev.container_names {
        if !curr.container_names.contains(c) {
            removed_containers.push(c.clone());
        }
    }

    let mut restarted_containers = Vec::new();
    for (name, curr_count) in &curr.container_restarts {
        let prev_count = prev.container_restarts.get(name).copied().unwrap_or(0);
        if *curr_count > prev_count {
            restarted_containers.push(name.clone());
        }
    }

    let mut changed_images = Vec::new();
    for (name, curr_img) in &curr.container_images {
        if let Some(prev_img) = prev.container_images.get(name) {
            if prev_img != curr_img {
                changed_images.push((name.clone(), prev_img.clone(), curr_img.clone()));
            }
        }
    }

    let growth = curr.disk_usage_pct as i16 - prev.disk_usage_pct as i16;
    let disk_growth_pct = if growth >= 5 { Some(growth) } else { None };

    let mut new_failed_units = Vec::new();
    for u in &curr.failed_units {
        if !prev.failed_units.contains(u) {
            new_failed_units.push(u.clone());
        }
    }

    let mut resolved_failed_units = Vec::new();
    for u in &prev.failed_units {
        if !curr.failed_units.contains(u) {
            resolved_failed_units.push(u.clone());
        }
    }

    let mut new_findings = Vec::new();
    for f in &curr.critical_finding_ids {
        if !prev.critical_finding_ids.contains(f) {
            new_findings.push(f.clone());
        }
    }

    let mut resolved_findings = Vec::new();
    for f in &prev.critical_finding_ids {
        if !curr.critical_finding_ids.contains(f) {
            resolved_findings.push(f.clone());
        }
    }

    SnapshotDiff {
        added_containers,
        removed_containers,
        restarted_containers,
        changed_images,
        disk_growth_pct,
        new_failed_units,
        resolved_failed_units,
        new_findings,
        resolved_findings,
    }
}

impl HostHistoryStore {
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

    pub fn record_snapshot(
        &mut self,
        host_id: &str,
        summary: SnapshotSummary,
    ) -> Option<SnapshotDiff> {
        let list = self.summaries.entry(host_id.to_string()).or_default();
        let diff = list.last().map(|prev| diff_summaries(prev, &summary));

        // Manage incidents
        if let Some(ref d) = diff {
            for finding in &d.new_findings {
                self.incidents.push(Incident {
                    id: format!("inc_{}_{}", host_id, summary.at_epoch),
                    host_id: host_id.to_string(),
                    title: finding.clone(),
                    opened_at_epoch: summary.at_epoch,
                    resolved_at_epoch: None,
                });
            }
            for resolved in &d.resolved_findings {
                for inc in self
                    .incidents
                    .iter_mut()
                    .filter(|i| i.host_id == host_id && i.resolved_at_epoch.is_none())
                {
                    if inc.title == *resolved {
                        inc.resolved_at_epoch = Some(summary.at_epoch);
                    }
                }
            }
        }

        list.push(summary);
        if list.len() > MAX_SUMMARIES_PER_HOST {
            let drop_count = list.len() - MAX_SUMMARIES_PER_HOST;
            list.drain(0..drop_count);
        }

        diff
    }

    pub fn latest_diff(&self, host_id: &str) -> Option<SnapshotDiff> {
        let list = self.summaries.get(host_id)?;
        if list.len() < 2 {
            return None;
        }
        let prev = &list[list.len() - 2];
        let curr = &list[list.len() - 1];
        Some(diff_summaries(prev, curr))
    }

    pub fn incidents_for(&self, host_id: &str) -> Vec<Incident> {
        self.incidents
            .iter()
            .filter(|i| i.host_id == host_id)
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diff_detects_changes() {
        let mut prev_img = HashMap::new();
        prev_img.insert("web".into(), "app:v1".into());
        let mut prev_restarts = HashMap::new();
        prev_restarts.insert("web".into(), 0);

        let prev = SnapshotSummary {
            at_epoch: 100,
            container_names: vec!["db".into(), "web".into()],
            container_images: prev_img,
            container_restarts: prev_restarts,
            disk_usage_pct: 40,
            failed_units: vec![],
            critical_finding_ids: vec![],
        };

        let mut curr_img = HashMap::new();
        curr_img.insert("web".into(), "app:v2".into());
        curr_img.insert("cache".into(), "redis:alpine".into());
        let mut curr_restarts = HashMap::new();
        curr_restarts.insert("web".into(), 1);

        let curr = SnapshotSummary {
            at_epoch: 200,
            container_names: vec!["cache".into(), "web".into()], // db removed, cache added
            container_images: curr_img,
            container_restarts: curr_restarts,
            disk_usage_pct: 48, // 8% growth
            failed_units: vec!["nginx.service".into()],
            critical_finding_ids: vec!["disk_critical".into()],
        };

        let diff = diff_summaries(&prev, &curr);
        assert_eq!(diff.added_containers, vec!["cache"]);
        assert_eq!(diff.removed_containers, vec!["db"]);
        assert_eq!(diff.restarted_containers, vec!["web"]);
        assert_eq!(
            diff.changed_images,
            vec![("web".into(), "app:v1".into(), "app:v2".into())]
        );
        assert_eq!(diff.disk_growth_pct, Some(8));
        assert_eq!(diff.new_failed_units, vec!["nginx.service"]);
        assert_eq!(diff.new_findings, vec!["disk_critical"]);
    }
}
