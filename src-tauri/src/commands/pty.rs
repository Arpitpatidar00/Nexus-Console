use crate::core::error::AppResult;
use crate::models::context::AppContext;
use crate::services::pty::{PtyEvent, PtyManager, PtyTarget};
use crate::services::remote::RemoteState;
use tauri::ipc::Channel;
use tauri::State;

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn pty_open(
    id: String,
    target: PtyTarget,
    cols: u16,
    rows: u16,
    on_event: Channel<PtyEvent>,
    ctx: State<'_, AppContext>,
    remote: State<'_, RemoteState>,
    mgr: State<'_, PtyManager>,
) -> AppResult<()> {
    crate::services::pty::pty_open(id, target, cols, rows, on_event, ctx, remote, mgr).await
}

#[tauri::command]
pub async fn pty_write(id: String, data: String, mgr: State<'_, PtyManager>) -> AppResult<()> {
    crate::services::pty::pty_write(id, data, mgr).await
}

#[tauri::command]
pub async fn pty_resize(
    id: String,
    cols: u16,
    rows: u16,
    mgr: State<'_, PtyManager>,
) -> AppResult<()> {
    crate::services::pty::pty_resize(id, cols, rows, mgr).await
}

#[tauri::command]
pub async fn pty_kill(id: String, mgr: State<'_, PtyManager>) -> AppResult<()> {
    let _guard = crate::core::mutation::mutation_unattended(
        crate::core::mutation::MutationSpec::new(
            "Kill Terminal PTY",
            format!("Kill terminal PTY session {id}"),
            "pty_kill",
        )
        .blast_radius(crate::core::mutation::BlastRadius::LocalIsolated)
        .target(&id),
    );
    crate::services::pty::pty_kill(id, mgr).await
}
