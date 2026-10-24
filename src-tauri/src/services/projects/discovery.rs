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

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir(label: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!(
            "sr-discovery-{label}-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn a_folder_with_a_manifest_is_a_project_without_git() {
        let dir = tmp_dir("manifest-no-git");
        std::fs::write(dir.join("package.json"), "{}").unwrap();
        assert!(is_project_dir(&dir));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_bare_makefile_only_counts_inside_a_repo() {
        let dir = tmp_dir("makefile-no-git");
        std::fs::write(dir.join("Makefile"), "all:\n\techo hi\n").unwrap();
        assert!(
            !is_project_dir(&dir),
            "a bare Makefile with no .git is not enough"
        );

        std::fs::create_dir_all(dir.join(".git")).unwrap();
        assert!(
            is_project_dir(&dir),
            "the same folder counts once it's a repo"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_unrelated_folder_is_not_a_project() {
        let dir = tmp_dir("plain");
        std::fs::write(dir.join("notes.txt"), "hi").unwrap();
        assert!(!is_project_dir(&dir));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn discovery_finds_a_nested_project_and_does_not_descend_into_it() {
        let root = tmp_dir("nested");
        let proj = root.join("apps/web");
        std::fs::create_dir_all(&proj).unwrap();
        std::fs::write(proj.join("package.json"), "{}").unwrap();
        // A manifest *inside* the discovered project must not also surface
        // as its own, separate project.
        std::fs::create_dir_all(proj.join("vendor")).unwrap();
        std::fs::write(proj.join("vendor/go.mod"), "module vendored\n").unwrap();

        let mut out = Vec::new();
        scan_dir_for_projects(&root, 0, 4, &mut out);
        assert_eq!(out.len(), 1, "{out:?}");
        assert_eq!(out[0].path, proj.to_string_lossy());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn discovery_skips_node_modules_target_dist_and_dotdirs() {
        let root = tmp_dir("skip-noise");
        for noisy in ["node_modules", "target", "dist", ".cache"] {
            let p = root.join(noisy).join("nested-pkg");
            std::fs::create_dir_all(&p).unwrap();
            std::fs::write(p.join("package.json"), "{}").unwrap();
        }
        let real = root.join("real-app");
        std::fs::create_dir_all(&real).unwrap();
        std::fs::write(real.join("package.json"), "{}").unwrap();

        let mut out = Vec::new();
        scan_dir_for_projects(&root, 0, 4, &mut out);
        assert_eq!(
            out.len(),
            1,
            "only the real project should surface: {out:?}"
        );
        assert_eq!(out[0].path, real.to_string_lossy());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn discovery_respects_the_depth_limit() {
        let root = tmp_dir("depth");
        // 5 levels deep, limit is 4 — must not be found.
        let deep = root.join("a/b/c/d/e");
        std::fs::create_dir_all(&deep).unwrap();
        std::fs::write(deep.join("package.json"), "{}").unwrap();

        let mut out = Vec::new();
        scan_dir_for_projects(&root, 0, 4, &mut out);
        assert!(
            out.is_empty(),
            "a project past max_depth must not surface: {out:?}"
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn discover_projects_expands_a_tilde_root() {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/Users".to_string());
        let marker = format!("sr-discovery-tilde-{}", std::process::id());
        let abs = PathBuf::from(&home).join(&marker);
        let _ = std::fs::remove_dir_all(&abs);
        std::fs::create_dir_all(&abs).unwrap();
        std::fs::write(abs.join("Cargo.toml"), "[package]\nname=\"x\"\n").unwrap();

        let out = discover_projects(&[format!("~/{marker}")]);
        assert_eq!(out.len(), 1, "{out:?}");
        assert_eq!(out[0].path, abs.to_string_lossy());

        let _ = std::fs::remove_dir_all(&abs);
    }

    #[test]
    fn discover_projects_ignores_a_root_that_does_not_exist() {
        let out = discover_projects(&["/no/such/path/at/all".to_string()]);
        assert!(out.is_empty());
    }
}
