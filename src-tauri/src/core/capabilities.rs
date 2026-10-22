// Per-module command capabilities and module gating (A-08 / PLAN.md E.4).
// Disabled modules expose no commands: `lib.rs` wraps the generated invoke
// handler and rejects any command whose owning module is switched off.

/// Map a Tauri IPC command name to its owning module ID.
/// Returns None for core/system commands that are always enabled.
pub fn command_module(cmd: &str) -> Option<&'static str> {
    if cmd.starts_with("aws_") {
        Some("cloud")
    } else if cmd.starts_with("docker_") {
        Some("docker")
    } else if cmd.starts_with("db_") {
        Some("databases")
    } else if cmd.starts_with("remote_") {
        Some("remote")
    } else if cmd.starts_with("maclean_") {
        Some("maclean")
    } else if cmd.starts_with("devices_") {
        Some("devices")
    } else if cmd.starts_with("claude_") && cmd != "claude_installed" {
        // `claude_installed` decides whether the module can be offered at all,
        // so it must answer while the module is still off.
        Some("claude")
    } else if cmd.starts_with("domains_") || cmd.starts_with("uptime_") {
        Some("domains")
    } else if cmd.starts_with("secrets_") {
        Some("secrets")
    } else if cmd.starts_with("network_") {
        Some("network")
    } else if cmd.starts_with("releases_") {
        Some("releases")
    } else if cmd.starts_with("backup_") {
        Some("backups")
    } else if cmd.starts_with("chaos_") {
        Some("network")
    } else if cmd.starts_with("package_")
        || cmd.starts_with("packages_")
        || cmd.starts_with("services_")
        || matches!(
            cmd,
            "list_services"
                | "start_service"
                | "stop_service"
                | "restart_service"
                | "set_link_intent"
                | "install_formula"
                | "search_formulae"
                | "formula_versions"
                | "uninstall_formula"
                | "list_packages"
                | "upgrade_package"
                | "upgrade_all"
                | "update_homebrew"
                | "trust_tap"
        )
    {
        Some("homebrew")
    } else if cmd.starts_with("ports_")
        || matches!(
            cmd,
            "list_ports" | "kill_process" | "probe_port_http" | "open_in_browser"
        )
    {
        Some("ports")
    } else if cmd.starts_with("projects_") {
        Some("projects")
    } else if cmd.starts_with("doctor_") || cmd.starts_with("vscode_") {
        Some("doctor")
    } else {
        None
    }
}

/// May `cmd` run under these settings? Core commands always may; module
/// commands follow `module_enabled` (fails open, like the frontend).
pub fn command_allowed(settings: Option<&serde_json::Value>, cmd: &str) -> bool {
    command_module(cmd).is_none_or(|m| crate::settings::module_enabled(settings, m))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn disabled_module_commands_are_rejected() {
        let s = json!({ "enabledModules": ["homebrew", "ports"] });
        assert!(command_allowed(Some(&s), "list_services"));
        assert!(command_allowed(Some(&s), "list_ports"));
        assert!(!command_allowed(Some(&s), "maclean_scan"));
        assert!(!command_allowed(Some(&s), "aws_list_profiles"));
        assert!(!command_allowed(Some(&s), "chaos_start_proxy"));
        // Core commands answer regardless of modules.
        assert!(command_allowed(Some(&s), "get_app_context"));
        assert!(command_allowed(Some(&s), "claude_installed"));
        assert!(command_allowed(Some(&s), "blueprint_export"));
        assert!(command_allowed(Some(&s), "pty_open"));
        // Unreadable settings fail open, matching the frontend's sanitizeModules.
        assert!(command_allowed(None, "maclean_scan"));
    }

    #[test]
    fn test_command_module_mapping() {
        assert_eq!(command_module("aws_list_profiles"), Some("cloud"));
        assert_eq!(command_module("docker_list_containers"), Some("docker"));
        assert_eq!(command_module("db_list_connections"), Some("databases"));
        assert_eq!(command_module("remote_connect"), Some("remote"));
        assert_eq!(command_module("maclean_scan"), Some("maclean"));
        assert_eq!(command_module("devices_list_ios"), Some("devices"));
        assert_eq!(command_module("claude_archive"), Some("claude"));
        assert_eq!(command_module("claude_installed"), None);
        assert_eq!(command_module("blueprint_export"), None);
        assert_eq!(command_module("chaos_simulate"), Some("network"));
        assert_eq!(command_module("uptime_ping_now"), Some("domains"));
        assert_eq!(command_module("upgrade_all"), Some("homebrew"));
        assert_eq!(command_module("update_homebrew"), Some("homebrew"));
        assert_eq!(command_module("trust_tap"), Some("homebrew"));
        assert_eq!(command_module("secrets_scan_projects"), Some("secrets"));
        assert_eq!(command_module("network_get_interfaces"), Some("network"));
        assert_eq!(command_module("releases_detect_config"), Some("releases"));
        assert_eq!(command_module("backup_create_db"), Some("backups"));
        assert_eq!(command_module("list_services"), Some("homebrew"));
        assert_eq!(command_module("list_ports"), Some("ports"));
        assert_eq!(command_module("projects_discover"), Some("projects"));
        assert_eq!(command_module("doctor_scan"), Some("doctor"));

        // Core/always-enabled commands return None
        assert_eq!(command_module("get_app_context"), None);
        assert_eq!(command_module("confirm_bulk"), None);
        assert_eq!(command_module("consent_get_all"), None);
        assert_eq!(command_module("net_get_declared_destinations"), None);
    }
}
