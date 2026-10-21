use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectReleaseConfig {
    pub project_path: String,
    pub platform: String,
    pub has_fastlane: bool,
    pub lanes: Vec<String>,
    pub version_name: Option<String>,
    pub build_number: Option<String>,
}

pub fn parse_pubspec_version(content: &str) -> (Option<String>, Option<String>) {
    for line in content.lines() {
        if line.starts_with("version:") {
            let raw = line.trim_start_matches("version:").trim();
            let clean = raw.split('#').next().unwrap_or("").trim();
            let parts: Vec<&str> = clean.split('+').collect();
            let ver = if !parts.is_empty() && !parts[0].trim().is_empty() {
                Some(parts[0].trim().to_string())
            } else {
                None
            };
            let build = if parts.len() > 1 && !parts[1].trim().is_empty() {
                Some(parts[1].trim().to_string())
            } else {
                None
            };
            return (ver, build);
        }
    }
    (None, None)
}

pub fn parse_package_json_version(content: &str) -> Option<String> {
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(content) {
        val.get("version")
            .and_then(|s| s.as_str())
            .map(|s| s.to_string())
    } else {
        None
    }
}

pub fn parse_fastfile_lanes(content: &str) -> Vec<String> {
    let mut lanes = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("lane :") {
            let lane_name = rest
                .split_whitespace()
                .next()
                .unwrap_or_default()
                .trim_matches(':');
            if !lane_name.is_empty() && !lanes.contains(&lane_name.to_string()) {
                lanes.push(lane_name.to_string());
            }
        }
    }
    lanes
}

pub fn detect_release_configs(project_path: &str) -> AppResult<ProjectReleaseConfig> {
    let p = Path::new(project_path);
    let mut platform = "generic".to_string();
    let mut has_fastlane = false;
    let mut lanes = Vec::new();
    let mut version_name = None;
    let mut build_number = None;

    if p.join("pubspec.yaml").exists() {
        platform = "flutter".to_string();
        if let Ok(content) = fs::read_to_string(p.join("pubspec.yaml")) {
            let (v, b) = parse_pubspec_version(&content);
            version_name = v;
            build_number = b;
        }
    } else if p.join("package.json").exists() {
        platform = if p.join("android").exists() || p.join("ios").exists() {
            "react-native".to_string()
        } else {
            "node".to_string()
        };
        if let Ok(content) = fs::read_to_string(p.join("package.json")) {
            version_name = parse_package_json_version(&content);
        }
    } else if p.join("ios").exists() || p.join("Podfile").exists() {
        platform = "ios".to_string();
    } else if p.join("android").exists() || p.join("build.gradle").exists() {
        platform = "android".to_string();
    }

    let fastfile_candidates = [
        p.join("fastlane/Fastfile"),
        p.join("ios/fastlane/Fastfile"),
        p.join("android/fastlane/Fastfile"),
    ];

    for candidate in &fastfile_candidates {
        if candidate.exists() {
            has_fastlane = true;
            if let Ok(content) = fs::read_to_string(candidate) {
                lanes = parse_fastfile_lanes(&content);
            }
            break;
        }
    }

    Ok(ProjectReleaseConfig {
        project_path: project_path.to_string(),
        platform,
        has_fastlane,
        lanes,
        version_name,
        build_number,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_release_configs_nonexistent_dir() {
        let res = detect_release_configs("/nonexistent/path/here");
        assert!(res.is_ok());
        let cfg = res.unwrap();
        assert_eq!(cfg.platform, "generic");
        assert!(!cfg.has_fastlane);
    }
}
