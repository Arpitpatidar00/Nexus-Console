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
        scan_dir_for_projects(&root, 0, 4, &mut projects);
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

/// A folder with a manifest the runner understands. Git isn't required:
/// plenty of projects (downloads, copies, new apps) aren't repos yet. A bare
/// Makefile or requirements.txt only counts inside a repo.
fn is_project_dir(dir: &Path) -> bool {
    const MANIFESTS: &[&str] = &[
        "package.json",
        "pubspec.yaml",
        "Cargo.toml",
        "go.mod",
        "pyproject.toml",
        "Pipfile",
        "manage.py",
        "pom.xml",
        "build.gradle",
        "build.gradle.kts",
        "settings.gradle.kts",
        "composer.json",
        "Gemfile",
        "deno.json",
        "compose.yaml",
        "docker-compose.yml",
    ];
    MANIFESTS.iter().any(|m| dir.join(m).is_file())
        || (dir.join(".git").exists()
            && ["Makefile", "requirements.txt", "setup.py"]
                .iter()
                .any(|m| dir.join(m).is_file()))
}

/// The most specific label the runner finds: "Next.js", "FastAPI", "Go".
fn detect_framework(dir: &Path) -> String {
    let d = super::runner::detect(dir, false);
    d.frameworks
        .iter()
        .find(|f| *f != "Monorepo")
        .or_else(|| d.stacks.first())
        .cloned()
        .unwrap_or_else(|| "Project".to_string())
}
