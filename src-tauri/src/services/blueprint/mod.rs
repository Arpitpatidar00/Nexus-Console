// Mac Blueprint Export, Import, and Visual Diff (P10.1).
// Exports Brewfile + managed hosts (no secrets/keys) + tunnels + workspaces +
// saved commands + Mac Clean rules + VS Code extensions list + app settings.
// Imports with step-by-step confirmation and conflict detection.

use crate::context::AppContext;
use crate::database::remote_store::{Env, Host, HostSource, ManualTarget};
use crate::error::{AppError, AppResult};
use crate::services::maclean::store::Rules;
use crate::services::maclean::MacleanState;
use crate::services::projects::store::{SavedCommand, WorkspaceConfig};
use crate::services::remote::RemoteState;
use crate::services::ProjectsState;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::process::Command;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlueprintHost {
    pub id: String,
    pub alias: Option<String>,
    pub label: String,
    pub project: String,
    pub env: String,
    /// Hand-added hosts' address. Missing from older blueprints, which is why
    /// imported hosts couldn't connect (Manual source with no target).
    #[serde(default)]
    pub manual: Option<ManualTarget>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlueprintTunnel {
    pub id: String,
    pub host_id: String,
    pub local_port: u16,
    pub remote_port: u16,
    pub remote_host: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NexusBlueprint {
    pub schema_version: u32,
    pub exported_at_epoch: u64,
    pub mac_hostname: String,
    pub brewfile: String,
    pub remote_hosts: Vec<BlueprintHost>,
    pub tunnels: Vec<BlueprintTunnel>,
    pub workspaces: Vec<WorkspaceConfig>,
    pub saved_commands: Vec<SavedCommand>,
    pub maclean_rules: Option<Rules>,
    pub vscode_extensions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlueprintDiffReport {
    pub missing_formulae: Vec<String>,
    pub missing_casks: Vec<String>,
    pub missing_taps: Vec<String>,
    pub missing_hosts: Vec<BlueprintHost>,
    pub conflicting_hosts: Vec<BlueprintHost>,
    pub missing_workspaces: Vec<String>,
    pub missing_extensions: Vec<String>,
    pub maclean_rules_different: bool,
}

pub fn export_blueprint(app: &AppHandle) -> AppResult<NexusBlueprint> {
    let ctx = app.state::<AppContext>();
    let brew_bin = ctx.brew_bin.as_deref().unwrap_or("/opt/homebrew/bin/brew");

    // 1. Brewfile dump
    let mut brewfile = String::new();
    if let Ok(out) = Command::new(brew_bin)
        .args(["bundle", "dump", "--file=-"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&out.stdout);
        // Only keep lines with tap, brew, cask, mas
        for line in stdout.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("tap ")
                || trimmed.starts_with("brew ")
                || trimmed.starts_with("cask ")
                || trimmed.starts_with("mas ")
            {
                brewfile.push_str(trimmed);
                brewfile.push('\n');
            }
        }
    }

    // 2. Remote hosts & tunnels (NO private keys or credentials!)
    let mut remote_hosts = Vec::new();
    let mut tunnels = Vec::new();
    if let Some(remote_state) = app.try_state::<RemoteState>() {
        if let Ok(s) = remote_state.read() {
            for h in &s.hosts {
                remote_hosts.push(BlueprintHost {
                    id: h.id.clone(),
                    alias: h.alias.clone(),
                    label: h.label.clone(),
                    project: h.project.clone(),
                    env: format!("{:?}", h.env).to_lowercase(),
                    manual: h.manual.clone(),
                });
            }
            for t in &s.tunnels {
                tunnels.push(BlueprintTunnel {
                    id: t.id.clone(),
                    host_id: t.host_id.clone(),
                    local_port: t.local_port,
                    remote_port: t.remote_port,
                    remote_host: t.remote_host.clone(),
                });
            }
        }
    }

    // 3. Workspaces & saved commands
    let mut workspaces = Vec::new();
    let mut saved_commands = Vec::new();
    if let Some(projects_state) = app.try_state::<ProjectsState>() {
        if let Ok(store) = projects_state.store.lock() {
            workspaces = store.workspaces.clone();
            saved_commands = store.commands.clone();
        }
    }

    // 4. Mac Clean rules
    let mut maclean_rules = None;
    if let Some(maclean_state) = app.try_state::<MacleanState>() {
        if let Ok(store) = maclean_state.read() {
            maclean_rules = Some(store.rules.clone());
        }
    }

    // 5. VS Code extensions
    let mut vscode_extensions = Vec::new();
    if let Ok(out) = Command::new("code").arg("--list-extensions").output() {
        if out.status.success() {
            for line in String::from_utf8_lossy(&out.stdout).lines() {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    vscode_extensions.push(trimmed.to_string());
                }
            }
        }
    }

    let mac_hostname = Command::new("hostname")
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "Mac".to_string());

    let exported_at_epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());

    Ok(NexusBlueprint {
        schema_version: 1,
        exported_at_epoch,
        mac_hostname,
        brewfile,
        remote_hosts,
        tunnels,
        workspaces,
        saved_commands,
        maclean_rules,
        vscode_extensions,
    })
}

pub fn analyze_blueprint(
    blueprint: &NexusBlueprint,
    app: &AppHandle,
) -> AppResult<BlueprintDiffReport> {
    let ctx = app.state::<AppContext>();
    let brew_bin = ctx.brew_bin.as_deref().unwrap_or("/opt/homebrew/bin/brew");

    // Local installed formulae & casks
    let mut installed_formulae = HashSet::new();
    let mut installed_casks = HashSet::new();
    let mut installed_taps = HashSet::new();

    if let Ok(out) = Command::new(brew_bin).args(["list", "--formula"]).output() {
        for line in String::from_utf8_lossy(&out.stdout).lines() {
            installed_formulae.insert(line.trim().to_string());
        }
    }
    if let Ok(out) = Command::new(brew_bin).args(["list", "--cask"]).output() {
        for line in String::from_utf8_lossy(&out.stdout).lines() {
            installed_casks.insert(line.trim().to_string());
        }
    }
    if let Ok(out) = Command::new(brew_bin).args(["tap"]).output() {
        for line in String::from_utf8_lossy(&out.stdout).lines() {
            installed_taps.insert(line.trim().to_string());
        }
    }

    // Parse Brewfile requirements
    let mut missing_formulae = Vec::new();
    let mut missing_casks = Vec::new();
    let mut missing_taps = Vec::new();

    for line in blueprint.brewfile.lines() {
        let t = line.trim();
        if t.starts_with("brew ") {
            if let Some(pkg) = extract_quoted_value(t) {
                let name = pkg.split('/').next_back().unwrap_or(&pkg);
                if !installed_formulae.contains(&pkg) && !installed_formulae.contains(name) {
                    missing_formulae.push(pkg);
                }
            }
        } else if t.starts_with("cask ") {
            if let Some(pkg) = extract_quoted_value(t) {
                let name = pkg.split('/').next_back().unwrap_or(&pkg);
                if !installed_casks.contains(&pkg) && !installed_casks.contains(name) {
                    missing_casks.push(pkg);
                }
            }
        } else if t.starts_with("tap ") {
            if let Some(tap) = extract_quoted_value(t) {
                if !installed_taps.contains(&tap) {
                    missing_taps.push(tap);
                }
            }
        }
    }

    // Compare remote hosts
    let mut missing_hosts = Vec::new();
    let mut conflicting_hosts = Vec::new();
    if let Some(remote_state) = app.try_state::<RemoteState>() {
        if let Ok(s) = remote_state.read() {
            for bh in &blueprint.remote_hosts {
                if let Some(alias) = &bh.alias {
                    if let Some(existing) = s.hosts.iter().find(|h| h.alias.as_ref() == Some(alias))
                    {
                        if existing.label != bh.label {
                            conflicting_hosts.push(bh.clone());
                        }
                    } else {
                        missing_hosts.push(bh.clone());
                    }
                } else {
                    missing_hosts.push(bh.clone());
                }
            }
        }
    }

    // Compare workspaces
    let mut missing_workspaces = Vec::new();
    if let Some(projects_state) = app.try_state::<ProjectsState>() {
        if let Ok(store) = projects_state.store.lock() {
            for bw in &blueprint.workspaces {
                if !store.workspaces.iter().any(|w| w.name == bw.name) {
                    missing_workspaces.push(bw.name.clone());
                }
            }
        }
    }

    // Compare VS Code extensions
    let mut installed_extensions = HashSet::new();
    if let Ok(out) = Command::new("code").arg("--list-extensions").output() {
        for line in String::from_utf8_lossy(&out.stdout).lines() {
            installed_extensions.insert(line.trim().to_lowercase());
        }
    }
    let mut missing_extensions = Vec::new();
    for ext in &blueprint.vscode_extensions {
        if !installed_extensions.contains(&ext.to_lowercase()) {
            missing_extensions.push(ext.clone());
        }
    }

    // Compare rules
    let maclean_rules_different = if let Some(import_rules) = &blueprint.maclean_rules {
        if let Some(maclean_state) = app.try_state::<MacleanState>() {
            if let Ok(store) = maclean_state.read() {
                store.rules.protected_names != import_rules.protected_names
                    || store.rules.project_roots != import_rules.project_roots
            } else {
                false
            }
        } else {
            false
        }
    } else {
        false
    };

    Ok(BlueprintDiffReport {
        missing_formulae,
        missing_casks,
        missing_taps,
        missing_hosts,
        conflicting_hosts,
        missing_workspaces,
        missing_extensions,
        maclean_rules_different,
    })
}

fn extract_quoted_value(line: &str) -> Option<String> {
    let start = line.find('"')? + 1;
    let end = line[start..].find('"')? + start;
    Some(line[start..end].to_string())
}

pub fn apply_homebrew_bundle(brewfile: &str, brew_bin: &str) -> AppResult<()> {
    let tmp = std::env::temp_dir().join(format!("stackroost_brewfile_{}.tmp", std::process::id()));
    fs::write(&tmp, brewfile).map_err(|e| AppError::Io(format!("write brewfile: {e}")))?;

    let status = Command::new(brew_bin)
        .args(["bundle", "install", "--file"])
        .arg(&tmp)
        .status()
        .map_err(|e| AppError::Shell(format!("brew bundle: {e}")))?;

    let _ = fs::remove_file(&tmp);

    if status.success() {
        Ok(())
    } else {
        Err(AppError::Shell(
            "brew bundle install failed for one or more packages".into(),
        ))
    }
}

pub fn apply_blueprint_hosts(hosts: Vec<BlueprintHost>, app: &AppHandle) -> AppResult<usize> {
    let remote_state = app
        .try_state::<RemoteState>()
        .ok_or_else(|| AppError::NotFound("remote state not available".into()))?;

    let count = remote_state.write(|store| {
        let mut added = 0;
        for bh in hosts {
            let exists = store.hosts.iter().any(|h| {
                h.id == bh.id
                    || bh.alias.is_some() && h.alias == bh.alias
                    || bh.manual.is_some() && h.manual == bh.manual
            });
            // Neither an ssh_config alias nor an address: nothing to connect to.
            if bh.alias.is_none() && bh.manual.is_none() {
                continue;
            }
            if !exists {
                let env = match bh.env.as_str() {
                    "prod" => Env::Prod,
                    "staging" => Env::Staging,
                    _ => Env::Dev,
                };
                let next_order = store.hosts.iter().map(|h| h.order).max().unwrap_or(0) + 1;
                store.hosts.push(Host {
                    id: bh.id,
                    source: if bh.manual.is_some() {
                        HostSource::Manual
                    } else {
                        HostSource::SshConfig
                    },
                    alias: bh.alias,
                    manual: bh.manual,
                    label: bh.label,
                    project: bh.project,
                    env,
                    order: next_order,
                    auto_connect: false,
                });
                added += 1;
            }
        }
        Ok(added)
    })?;

    Ok(count)
}

pub fn apply_blueprint_workspaces(
    workspaces: Vec<WorkspaceConfig>,
    app: &AppHandle,
) -> AppResult<usize> {
    let projects_state = app
        .try_state::<ProjectsState>()
        .ok_or_else(|| AppError::NotFound("projects state not available".into()))?;

    let mut store = projects_state
        .store
        .lock()
        .map_err(|_| AppError::Io("projects store lock poisoned".into()))?;

    let mut added = 0;
    for bw in workspaces {
        if !store.workspaces.iter().any(|w| w.name == bw.name) {
            store.workspaces.push(bw);
            added += 1;
        }
    }
    let dir = projects_state.path.parent().unwrap_or(&projects_state.path);
    store.save(dir).map_err(|e| AppError::Io(e.to_string()))?;
    Ok(added)
}

pub fn apply_blueprint_extensions(extensions: Vec<String>) -> AppResult<usize> {
    let mut installed = 0;
    for ext in extensions {
        if let Ok(status) = Command::new("code")
            .args(["--install-extension", &ext])
            .status()
        {
            if status.success() {
                installed += 1;
            }
        }
    }
    Ok(installed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_quoted_value() {
        assert_eq!(
            extract_quoted_value(r#"brew "redis""#),
            Some("redis".into())
        );
        assert_eq!(
            extract_quoted_value(r#"cask "google-chrome""#),
            Some("google-chrome".into())
        );
        assert_eq!(
            extract_quoted_value(r#"tap "homebrew/services""#),
            Some("homebrew/services".into())
        );
        assert_eq!(extract_quoted_value("junk"), None);
    }
}
