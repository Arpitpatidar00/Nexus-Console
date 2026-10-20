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
            for line in content.lines() {
                if line.starts_with("version:") {
                    let parts: Vec<&str> = line
                        .trim_start_matches("version:")
                        .trim()
                        .split('+')
                        .collect();
                    if !parts.is_empty() {
                        version_name = Some(parts[0].to_string());
                    }
                    if parts.len() > 1 {
                        build_number = Some(parts[1].to_string());
                    }
                    break;
                }
            }
        }
    } else if p.join("package.json").exists() {
        platform = if p.join("android").exists() || p.join("ios").exists() {
            "react-native".to_string()
        } else {
            "node".to_string()
        };
        if let Ok(content) = fs::read_to_string(p.join("package.json")) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(v) = val.get("version").and_then(|s| s.as_str()) {
                    version_name = Some(v.to_string());
                }
            }
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
                for line in content.lines() {
                    let trimmed = line.trim();
                    if let Some(rest) = trimmed.strip_prefix("lane :") {
                        let lane_name = rest
                            .split_whitespace()
                            .next()
                            .unwrap_or_default()
                            .trim_matches(':');
                        if !lane_name.is_empty() {
                            lanes.push(lane_name.to_string());
                        }
                    }
                }
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
