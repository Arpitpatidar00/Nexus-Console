// Stackroost — Tauri core.

pub mod commands;
pub mod core;
pub mod database;
pub mod models;
pub mod services;

// Backward-compatible crate root aliases for internal references
pub use core::error::{self, AppError, AppResult};
pub use core::util;
pub use database::settings_store as settings;
pub use models::context::{self, AppContext, BrewVersion};
pub use models::tray::TrayService;
pub use services::brew;
pub use services::databases;
pub use services::doctor;
pub use services::local_docker;
pub use services::maclean;
pub use services::projects;
pub use services::pty;
pub use services::remote;
pub use services::session;
pub use services::session::quit;
pub use services::tray;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    core::exec::ensure_tool_path();
    tauri::Builder::default()
        // single-instance MUST be registered first (focuses the existing window
        // instead of launching a second copy).
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_store::Builder::new().build())
        // Exclude VISIBLE: the plugin's on-window-ready restore would show() the
        // window before the webview paints, defeating `visible: false` (the
        // frontend shows the window itself once the splash is ready). Geometry
        // still restores — while hidden, so no resize jump either.
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        & !tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let ctx = context::discover();
            let brew_bin = ctx.brew_bin.clone();
            app.manage(ctx);
            app.manage(context::BrewVersion::default());
            app.manage(brew::BrewLock::default());
            app.manage(commands::services::ServicesCache::default());
            app.manage(pty::PtyManager::default());
            app.manage(session::SessionServices::default());
            app.manage(remote::RemoteState::load(remote::store::path_in(
                app.path().app_data_dir()?,
            )));
            app.manage(maclean::MacleanState::load(
                app.path().app_data_dir()?.join(maclean::store::FILE_NAME),
            ));
            app.manage(databases::DatabaseState::load(
                app.path().app_data_dir()?.join("local-databases.json"),
            ));
            app.manage(crate::services::kafka::KafkaState::load(
                app.path().app_data_dir()?,
            ));
            app.manage(projects::ProjectsState::load(
                app.path().app_data_dir()?.join("projects.json"),
            ));
            app.manage(crate::services::chaos::ChaosManager::default());
            tray::build_tray(app.handle())?;
            // Consent lives with the other stores (A-06); set before anything reads it.
            if let Ok(dir) = app.path().app_data_dir() {
                core::consent::set_consent_dir(dir.clone());
                // Local error log (G.4): panics from here on are recorded.
                core::diag::set_dir(dir);
                core::diag::install_panic_hook();
            }
            // Unified background scheduler (A-10 / PLAN.md E.5): one battery-aware daemon
            // managing remote health, dead-man switch, Mac Clean, uptime, and Doctor.
            crate::services::scheduler::start(app.handle().clone());
            // brew --version costs 100-500ms — resolve it off the startup path so
            // it never blocks first paint. Consumers render "v—" until it lands.
            if let Some(bin) = brew_bin {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn_blocking(move || {
                    if let Some(v) = context::resolve_brew_version(&bin) {
                        *handle.state::<context::BrewVersion>().0.write().unwrap() = Some(v);
                    }
                });
            }
            Ok(())
        })
        // X closes to the tray — services keep running. Real quit is Cmd+Q / tray Quit.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(module_gate(tauri::generate_handler![
            // Core & System
            commands::confirm_bulk,
            commands::trust_tap,
            commands::context::get_app_context,
            commands::consent::consent_get_all,
            commands::consent::consent_set,
            commands::consent::consent_revoke_all,
            commands::consent::net_get_declared_destinations,
            commands::system::system_disk_free,
            commands::system::system_detect_tools,
            commands::system::system_set_global_hotkey,
            commands::diag::app_about,
            commands::diag::diag_log_error,
            commands::diag::diag_list_errors,
            commands::diag::diag_clear_errors,
            commands::diag::diag_report,
            // Doctor
            commands::doctor::doctor_scan,
            commands::doctor::doctor_deep_scan,
            commands::doctor::doctor_cancel_deep_scan,
            commands::doctor::doctor_fix,
            commands::doctor::doctor_journal,
            commands::doctor::doctor_export,
            commands::archiver::claude_installed,
            commands::archiver::claude_projects,
            commands::archiver::claude_sessions,
            commands::archiver::claude_archive,
            commands::archiver::claude_archive_files,
            commands::archiver::claude_archived,
            commands::archiver::claude_restore,
            commands::archiver::claude_delete,
            commands::archiver::claude_delete_live,
            commands::archiver::claude_settings,
            commands::archiver::claude_set_retention,
            commands::archiver::claude_search_transcripts,
            commands::archiver::claude_export_markdown,
            commands::archiver::claude_session_context,
            commands::archiver::claude_project_usage,
            commands::vscode::vscode_cleanup_orphans,
            commands::vscode::vscode_vacuum,
            commands::services::list_services,
            commands::services::start_service,
            commands::services::stop_service,
            commands::services::restart_service,
            commands::services::services_diagnose,
            commands::services::services_open_config,
            commands::services::set_link_intent,
            commands::services::install_formula,
            commands::services::search_formulae,
            commands::services::formula_versions,
            commands::services::uninstall_formula,
            commands::ports::list_ports,
            commands::ports::kill_process,
            commands::ports::probe_port_http,
            commands::ports::open_in_browser,
            commands::packages::list_packages,
            commands::packages::packages_outdated,
            commands::packages::package_dependents,
            commands::packages::upgrade_package,
            commands::packages::upgrade_all,
            commands::packages::package_info,
            commands::packages::update_homebrew,
            commands::packages::package_pin,
            commands::packages::package_unpin,
            commands::packages::package_cellar_versions,
            commands::packages::package_rollback,
            commands::blueprint::blueprint_export,
            commands::blueprint::blueprint_analyze_import,
            commands::blueprint::blueprint_apply_homebrew,
            commands::blueprint::blueprint_apply_hosts,
            commands::blueprint::blueprint_apply_workspaces,
            commands::blueprint::blueprint_apply_extensions,
            commands::updater::app_check_update,
            commands::updater::app_install_update,
            commands::domains::domains_lookup_dns,
            commands::domains::domains_check_ssl,
            commands::domains::domains_check_rdap,
            commands::domains::domains_check_propagation,
            commands::domains::uptime_list_monitors,
            commands::domains::uptime_save_monitor,
            commands::domains::uptime_delete_monitor,
            commands::domains::uptime_ping_now,
            commands::secrets::secrets_scan_projects,
            commands::secrets::secrets_scan_history,
            commands::cloud::aws_list_profiles,
            commands::cloud::aws_list_ec2_instances,
            commands::cloud::aws_instance_action,
            commands::cloud::aws_get_costs,
            commands::cloud::aws_list_s3_buckets,
            commands::backups::backup_create_db,
            commands::backups::backup_list_history,
            commands::backups::backup_delete,
            commands::backups::backup_env_files,
            commands::network::network_get_interfaces,
            commands::network::network_get_bandwidth,
            commands::network::network_flush_dns,
            commands::network::network_get_hosts,
            commands::network::network_save_hosts,
            commands::network::network_restore_hosts,
            commands::devices::devices_list_ios,
            commands::devices::devices_control_ios,
            commands::devices::devices_list_android,
            commands::devices::devices_launch_android,
            commands::devices::devices_get_logcat,
            commands::devices::devices_install_apk,
            commands::releases::releases_detect_config,
            commands::ai::ai_check_ollama,
            commands::ai::ai_prepare_prompt,
            commands::ai::ai_explain,
            commands::ai::ai_get_model_pricing,
            commands::ai::ai_save_model_pricing,
            commands::maclean::maclean_scan,
            commands::maclean::maclean_cancel_scan,
            commands::maclean::maclean_clean,
            commands::maclean::maclean_rules,
            commands::maclean::maclean_set_rules,
            commands::maclean::maclean_journal,
            commands::maclean::maclean_memory,
            commands::maclean::maclean_deep_scan,
            commands::maclean::maclean_open_full_disk_access,
            commands::maclean::maclean_open_users_and_groups,
            commands::maclean::maclean_thin_snapshots,
            commands::maclean::maclean_delete_snapshot,
            commands::maclean::maclean_delete_path,
            commands::maclean::maclean_drill,
            commands::maclean::maclean_reveal,
            commands::maclean::maclean_ghost_scan,
            commands::maclean::maclean_projects_scan,
            commands::maclean::maclean_clean_projects,
            commands::maclean::maclean_appdata_scan,
            commands::maclean::maclean_clean_appdata,
            commands::maclean::maclean_ghost_clean,
            commands::maclean::maclean_energy_sample,
            commands::maclean::maclean_pause_service,
            commands::maclean::maclean_resume_process,
            commands::maclean::maclean_paused_pids,
            commands::maclean::maclean_trends,
            commands::maclean::maclean_duplicates_scan,
            commands::maclean::maclean_duplicates_delete,
            commands::remote::remote_state,
            commands::remote::remote_set_consent,
            commands::remote::remote_scan_config,
            commands::remote::remote_import_hosts,
            commands::remote::remote_add_manual_host,
            commands::remote::remote_update_host,
            commands::remote::remote_remove_host,
            commands::remote::remote_connect,
            commands::remote::remote_disconnect,
            commands::remote::remote_status,
            commands::remote::remote_snapshot,
            commands::remote::remote_docker_action,
            commands::remote::remote_journal,
            commands::remote::remote_get_tunnels,
            commands::remote::remote_add_tunnel,
            commands::remote::remote_update_tunnel,
            commands::remote::remote_remove_tunnel,
            commands::remote::remote_open_tunnel,
            commands::remote::remote_close_tunnel,
            commands::remote::remote_compose_action,
            commands::remote::remote_inspect_services,
            commands::remote::remote_disk_report,
            commands::remote::remote_container_logs,
            commands::remote::remote_prune_builder,
            commands::remote::remote_prune_images,
            commands::remote::remote_list_files,
            commands::remote::remote_read_file,
            commands::remote::remote_download_file,
            commands::remote::remote_upload_file,
            commands::remote::remote_get_note,
            commands::remote::remote_save_note,
            commands::remote::remote_get_history,
            commands::remote::remote_get_runbooks,
            commands::remote::remote_add_runbook,
            commands::remote::remote_remove_runbook,
            commands::remote::remote_audit_parity,
            commands::remote::remote_preview_deploy,
            commands::remote::remote_execute_deploy,
            commands::remote::remote_rollback_deploy,
            commands::remote::remote_get_deploys,
            commands::remote::remote_promote_env,
            commands::remote::remote_push_image,
            commands::docker::docker_runtime_status,
            commands::docker::docker_list_containers,
            commands::docker::docker_container_action,
            commands::docker::docker_compose_action,
            commands::databases::db_discover_connections,
            commands::databases::db_list_connections,
            commands::databases::db_add_connection,
            commands::databases::db_update_connection,
            commands::databases::db_move_connection,
            commands::databases::db_remove_connection,
            commands::databases::db_list_groups,
            commands::databases::db_create_group,
            commands::databases::db_update_group,
            commands::databases::db_delete_group,
            commands::databases::db_list_custom_mappings,
            commands::databases::db_save_custom_mapping,
            commands::databases::db_delete_custom_mapping,
            commands::databases::db_list_rejected_candidates,
            commands::databases::db_reject_candidate,
            commands::databases::db_unreject_candidate,
            commands::databases::db_ping,
            commands::databases::db_schema,
            commands::databases::db_browse,
            commands::databases::db_save_export,
            commands::databases::db_run_query,
            commands::databases::db_list_snapshots,
            commands::databases::db_create_snapshot,
            commands::databases::db_restore_snapshot,
            commands::kafka::kafka_list_clusters,
            commands::kafka::kafka_add_cluster,
            commands::kafka::kafka_update_cluster,
            commands::kafka::kafka_remove_cluster,
            commands::kafka::kafka_test_connection,
            commands::kafka::kafka_ping,
            commands::kafka::kafka_overview,
            commands::kafka::kafka_topics,
            commands::kafka::kafka_topic_detail,
            commands::kafka::kafka_groups,
            commands::kafka::kafka_group_detail,
            commands::kafka::kafka_consume,
            commands::kafka::kafka_broker_configs,
            commands::projects::projects_discover,
            commands::projects::projects_profile,
            commands::projects::projects_create_env,
            commands::projects::projects_stop_process,
            commands::projects::projects_open_in,
            commands::projects::projects_git_fetch,
            commands::projects::projects_delete_merged_branches,
            commands::projects::projects_get_github_status,
            commands::projects::projects_list_workspaces,
            commands::projects::projects_save_workspace,
            commands::projects::projects_delete_workspace,
            commands::projects::projects_start_workspace,
            commands::projects::projects_stop_workspace,
            commands::projects::projects_list_saved_commands,
            commands::projects::projects_save_command,
            commands::projects::projects_delete_command,
            commands::pty::pty_open,
            commands::pty::pty_write,
            commands::pty::pty_resize,
            commands::pty::pty_kill,
            commands::tray::set_tray_title,
            commands::tray::set_tray_services,
            commands::tray::set_tray_servers,
            commands::chaos::chaos_start_proxy,
            commands::chaos::chaos_stop_proxy,
            commands::chaos::chaos_list_proxies,
            commands::chaos::chaos_simulate,
        ]))
        .build(tauri::generate_context!())
        .expect("error while building Stackroost")
        .run(|app, event| {
            // On real quit: kill PTYs, close ssh masters, stop explicitly-unlinked
            // running services.
            if let tauri::RunEvent::ExitRequested { .. } = event {
                app.state::<crate::services::chaos::ChaosManager>()
                    .stop_all_sync();
                app.state::<pty::PtyManager>().kill_all();
                app.state::<crate::maclean::MacleanState>()
                    .resume_all_paused();
                app.state::<remote::RemoteState>().disconnect_all();
                quit::stop_session_services(app);
            }
        });
}

/// Disabled modules expose no commands (A-08 / PLAN.md E.4): a call into a
/// switched-off module is rejected before the command body runs.
fn module_gate<F>(handler: F) -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static
where
    F: Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static,
{
    move |invoke| {
        let cmd = invoke.message.command();
        if let Some(module) = core::capabilities::command_module(cmd) {
            let app = invoke.message.webview().app_handle().clone();
            if !settings::module_enabled(settings::read(&app).as_ref(), module) {
                invoke.resolver.reject(AppError::Forbidden(format!(
                    "The {module} module is turned off. Enable it in Settings to use it."
                )));
                return true;
            }
        }
        handler(invoke)
    }
}
