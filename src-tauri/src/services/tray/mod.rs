use std::sync::Mutex;
use tauri::menu::{CheckMenuItem, IsMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Wry};

pub use crate::models::tray::{TrayServer, TrayService};

static CACHED_SERVICES: Mutex<Vec<TrayService>> = Mutex::new(Vec::new());
static CACHED_SERVERS: Mutex<Vec<TrayServer>> = Mutex::new(Vec::new());

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn homebrew_on(app: &AppHandle) -> bool {
    crate::settings::module_enabled(crate::settings::read(app).as_ref(), "homebrew")
}

fn servers_on(app: &AppHandle) -> bool {
    crate::settings::module_enabled(crate::settings::read(app).as_ref(), "remote")
}

fn build_menu(
    app: &AppHandle,
    services: &[TrayService],
    servers: &[TrayServer],
    show_services: bool,
    show_servers: bool,
) -> tauri::Result<Menu<Wry>> {
    let header = MenuItem::with_id(app, "hdr", "Active Services", false, None::<&str>)?;
    let empty = MenuItem::with_id(app, "empty", "No active services", false, None::<&str>)?;
    let sep_services = PredefinedMenuItem::separator(app)?;
    let sep_servers = PredefinedMenuItem::separator(app)?;
    let sep_bottom = PredefinedMenuItem::separator(app)?;
    let open = MenuItem::with_id(app, "open", "Open Dashboard", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Stackroost", true, None::<&str>)?;

    let rows = services
        .iter()
        .map(|s| {
            CheckMenuItem::with_id(
                app,
                format!("svc:{}", s.name),
                &s.name,
                false,
                s.running,
                None::<&str>,
            )
        })
        .collect::<tauri::Result<Vec<CheckMenuItem<Wry>>>>()?;

    let mut items: Vec<&dyn IsMenuItem<Wry>> = Vec::new();
    if show_services {
        items.push(&header);
        if rows.is_empty() {
            items.push(&empty);
        } else {
            items.extend(rows.iter().map(|r| r as &dyn IsMenuItem<Wry>));
        }
        items.push(&sep_services);
    }

    let srv_rows: Vec<MenuItem<Wry>> = if show_servers {
        servers
            .iter()
            .filter(|s| s.connected)
            .map(|s| {
                let text = format!("● {} — {}", s.label, s.status);
                MenuItem::with_id(app, format!("srv:{}", s.id), &text, true, None::<&str>)
            })
            .collect::<tauri::Result<Vec<MenuItem<Wry>>>>()?
    } else {
        Vec::new()
    };

    let srv_hdr = MenuItem::with_id(app, "srv_hdr", "Connected Servers", false, None::<&str>)?;
    if !srv_rows.is_empty() {
        items.push(&srv_hdr);
        items.extend(srv_rows.iter().map(|r| r as &dyn IsMenuItem<Wry>));
        items.push(&sep_servers);
    }

    items.push(&open);
    items.push(&sep_bottom);
    items.push(&quit);
    Menu::with_items(app, &items)
}

fn rebuild_menu(app: &AppHandle) {
    let svcs = CACHED_SERVICES
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();
    let srvs = CACHED_SERVERS.lock().map(|g| g.clone()).unwrap_or_default();
    if let Some(tray) = app.tray_by_id("main") {
        if let Ok(menu) = build_menu(app, &svcs, &srvs, homebrew_on(app), servers_on(app)) {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app, &[], &[], homebrew_on(app), servers_on(app))?;
    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            id if id.starts_with("srv:") => {
                show_main(app);
                if let Some(host_id) = id.strip_prefix("srv:") {
                    use tauri::Emitter;
                    let _ = app.emit("open-server", host_id);
                }
            }
            _ => {} // service rows are disabled → no events
        });
    if let Ok(icon) = tauri::image::Image::from_bytes(include_bytes!("../../../icons/tray.png")) {
        builder = builder.icon(icon).icon_as_template(true);
    }
    builder.build(app)?;
    Ok(())
}

pub fn set_tray_services(services: Vec<TrayService>, app: AppHandle) {
    if let Ok(mut guard) = CACHED_SERVICES.lock() {
        *guard = services;
    }
    rebuild_menu(&app);
}

pub fn set_tray_servers(servers: Vec<TrayServer>, app: AppHandle) {
    if let Ok(mut guard) = CACHED_SERVERS.lock() {
        *guard = servers;
    }
    rebuild_menu(&app);
}

pub fn set_tray_title(title: String, app: AppHandle) {
    if let Some(tray) = app.tray_by_id("main") {
        let is_prod = crate::services::remote::deadman::has_active_prod_host(
            &app.state::<crate::services::remote::RemoteState>(),
        );
        let full_title = if is_prod {
            if title.is_empty() {
                "[PROD]".to_string()
            } else {
                format!("[PROD] {title}")
            }
        } else {
            title
        };
        let _ = tray.set_title(if full_title.is_empty() {
            None
        } else {
            Some(full_title)
        });
    }
}
