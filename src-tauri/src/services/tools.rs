// Which developer tools are installed (PLAN F.3 onboarding). Path checks only:
// nothing is executed, so it is instant and can't wake a daemon (Docker,
// Ollama) the way `docker info` / `ollama list` would.

use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedTool {
    pub id: &'static str,
    pub label: &'static str,
    pub installed: bool,
}

/// (id, label, candidate paths; a leading `~/` is the home directory).
const TOOLS: &[(&str, &str, &[&str])] = &[
    (
        "brew",
        "Homebrew",
        &["/opt/homebrew/bin/brew", "/usr/local/bin/brew"],
    ),
    (
        "docker",
        "Docker",
        &[
            "/usr/local/bin/docker",
            "/opt/homebrew/bin/docker",
            "~/.docker/bin/docker",
            "~/.orbstack/bin/docker",
            "/Applications/Docker.app",
            "/Applications/OrbStack.app",
        ],
    ),
    (
        "aws",
        "AWS CLI",
        &["/opt/homebrew/bin/aws", "/usr/local/bin/aws"],
    ),
    (
        "gh",
        "GitHub CLI",
        &["/opt/homebrew/bin/gh", "/usr/local/bin/gh"],
    ),
    (
        "ollama",
        "Ollama",
        &[
            "/opt/homebrew/bin/ollama",
            "/usr/local/bin/ollama",
            "/Applications/Ollama.app",
        ],
    ),
    (
        "flutter",
        "Flutter",
        &[
            "/opt/homebrew/bin/flutter",
            "~/flutter/bin/flutter",
            "~/development/flutter/bin/flutter",
            "~/fvm/default/bin/flutter",
        ],
    ),
    ("xcode", "Xcode", &["/Applications/Xcode.app"]),
    (
        "android",
        "Android SDK",
        &["~/Library/Android/sdk/emulator/emulator"],
    ),
    (
        "databases",
        "psql / mysql",
        &[
            "/opt/homebrew/bin/psql",
            "/usr/local/bin/psql",
            "/opt/homebrew/bin/mysql",
            "/usr/local/bin/mysql",
            "/Applications/Postgres.app",
        ],
    ),
];

pub fn detect_with(home: &Path, exists: impl Fn(&Path) -> bool) -> Vec<DetectedTool> {
    TOOLS
        .iter()
        .map(|(id, label, paths)| DetectedTool {
            id,
            label,
            installed: paths.iter().any(|p| match p.strip_prefix("~/") {
                Some(rest) => exists(&home.join(rest)),
                None => exists(Path::new(p)),
            }),
        })
        .collect()
}

pub fn detect() -> Vec<DetectedTool> {
    let home = std::env::var("HOME").unwrap_or_default();
    detect_with(Path::new(&home), Path::exists)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_by_absolute_and_home_relative_paths() {
        let home = Path::new("/Users/me");
        let present = ["/opt/homebrew/bin/brew", "/Users/me/.orbstack/bin/docker"];
        let found = detect_with(home, |p| present.iter().any(|x| Path::new(x) == p));
        let installed: Vec<_> = found.iter().filter(|t| t.installed).map(|t| t.id).collect();
        assert_eq!(installed, ["brew", "docker"]);
        assert_eq!(found.len(), TOOLS.len());
    }

    #[test]
    fn nothing_installed_is_all_false() {
        assert!(detect_with(Path::new("/nope"), |_| false)
            .iter()
            .all(|t| !t.installed));
    }
}
