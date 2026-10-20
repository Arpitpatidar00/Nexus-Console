// Nexus Console — Tauri core.

mod brew;
mod commands;
mod context;
mod doctor;
mod error;
mod maclean;
mod pty;
mod quit;
mod remote;
mod session;
mod settings;
mod tray;
mod util;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
            tray::build_tray(app.handle())?;
            // Doctor tray automation (opt-in via Archiver settings): daily
            // auto-archive + VACUUM-when-VSCode-closes. Daemon thread, 5-min tick.
            doctor::scheduler::start(app.handle().clone());
            // Servers background health (opt-in; never connects on its own).
            remote::background::start(app.handle().clone());
            // Mac Clean scheduled cleanup + low-disk warning (opt-in).
            maclean::background::start(app.handle().clone());
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
        .invoke_handler(tauri::generate_handler![
            commands::confirm_bulk,
            commands::trust_tap,
            commands::context::get_app_context,
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
            commands::vscode::vscode_cleanup_orphans,
            commands::vscode::vscode_vacuum,
            commands::services::list_services,
            commands::services::start_service,
            commands::services::stop_service,
            commands::services::restart_service,
            commands::services::set_link_intent,
            commands::services::install_formula,
            commands::services::search_formulae,
            commands::services::formula_versions,
            commands::services::uninstall_formula,
            commands::ports::list_ports,
            commands::ports::kill_process,
            commands::packages::list_packages,
            commands::packages::packages_outdated,
            commands::packages::package_dependents,
            commands::packages::upgrade_package,
            commands::packages::upgrade_all,
            commands::packages::package_info,
            commands::packages::update_homebrew,
            commands::maclean::maclean_scan,
            commands::maclean::maclean_cancel_scan,
            commands::maclean::maclean_clean,
            commands::maclean::maclean_rules,
            commands::maclean::maclean_set_rules,
            commands::maclean::maclean_journal,
            commands::maclean::maclean_memory,
            commands::maclean::maclean_deep_scan,
            commands::maclean::maclean_drill,
            commands::maclean::maclean_reveal,
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
            pty::pty_open,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            tray::set_tray_title,
            tray::set_tray_services
        ])
        .build(tauri::generate_context!())
        .expect("error while building Nexus Console")
        .run(|app, event| {
            // On real quit: kill PTYs, close ssh masters, stop explicitly-unlinked
            // running services.
            if let tauri::RunEvent::ExitRequested { .. } = event {
                app.state::<pty::PtyManager>().kill_all();
                app.state::<remote::RemoteState>().disconnect_all();
                quit::stop_session_services(app);
            }
        });
}
