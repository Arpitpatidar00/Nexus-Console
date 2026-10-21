use super::git::{get_git_status, GitStatus};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredProject {
    pub name: String,
    pub path: String,
    pub framework: String,
    pub git: Option<GitStatus>,
}

pub fn discover_projects(roots: &[String]) -> Vec<DiscoveredProject> {
    let mut projects = Vec::new();
    let home = std::env::var("HOME").unwrap_or_else(|_| "/Users".to_string());

    let mut expanded_roots = Vec::new();
    for r in roots {
        let p = if r.starts_with("~/") {
            PathBuf::from(r.replacen('~', &home, 1))
        } else {
            PathBuf::from(r)
        };
        expanded_roots.push(p);
    }

    if expanded_roots.is_empty() {
        expanded_roots.push(PathBuf::from(&home).join("Desktop"));
        expanded_roots.push(PathBuf::from(&home).join("Developer"));
        expanded_roots.push(PathBuf::from(&home).join("Projects"));
        expanded_roots.push(PathBuf::from(&home).join("Code"));
    }

    for root in expanded_roots {
        if !root.exists() || !root.is_dir() {
            continue;
        }
        scan_dir_for_projects(&root, 0, 2, &mut projects);
    }

    projects.sort_by_key(|a| a.name.to_lowercase());
    projects
}

fn scan_dir_for_projects(
    dir: &Path,
    depth: usize,
    max_depth: usize,
    out: &mut Vec<DiscoveredProject>,
) {
    if depth > max_depth {
        return;
    }

    // Check if current dir is a project
    if is_project_dir(dir) {
        let name = dir
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let framework = detect_framework(dir);
        let git = get_git_status(dir).ok();

        out.push(DiscoveredProject {
            name,
            path: dir.to_string_lossy().to_string(),
            framework,
            git,
        });
        return; // Don't descend into subdirectories of a discovered project
    }

    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let fname = p.file_name().unwrap_or_default().to_string_lossy();
                if fname.starts_with('.')
                    || fname == "node_modules"
                    || fname == "target"
                    || fname == "dist"
                {
                    continue;
                }
                scan_dir_for_projects(&p, depth + 1, max_depth, out);
            }
        }
    }
}

fn is_project_dir(dir: &Path) -> bool {
    if !dir.join(".git").exists() {
        return false;
    }
    dir.join("package.json").exists()
        || dir.join("pubspec.yaml").exists()
        || dir.join("Cargo.toml").exists()
        || dir.join("go.mod").exists()
        || dir.join("pyproject.toml").exists()
}

fn detect_framework(dir: &Path) -> String {
    if dir.join("package.json").exists() {
        if dir.join("next.config.js").exists()
            || dir.join("next.config.ts").exists()
            || dir.join("next.config.mjs").exists()
        {
            "Next.js".to_string()
        } else if dir.join("vite.config.ts").exists() || dir.join("vite.config.js").exists() {
            "Vite".to_string()
        } else {
            "Node.js".to_string()
        }
    } else if dir.join("Cargo.toml").exists() {
        "Rust".to_string()
    } else if dir.join("go.mod").exists() {
        "Go".to_string()
    } else if dir.join("pubspec.yaml").exists() {
        "Flutter".to_string()
    } else if dir.join("pyproject.toml").exists() {
        "Python".to_string()
    } else {
        "Git Project".to_string()
    }
}
