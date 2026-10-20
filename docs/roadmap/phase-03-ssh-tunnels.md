# Phase 3: SSH Tunnels — Specification

> **Phase:** P3  
> **Target Branch:** `feat/mac-clean`  
> **Status:** Implementing

---

## 1. Overview & Goals

Phase 3 introduces first-class SSH port forwarding into Stackroost.
It allows developers to:

- Define tunnel configurations associated with remote hosts (`remote.json`).
- Forward local loopback ports (`127.0.0.1:<localPort>`) to remote targets (`<remoteHost>:<remotePort>`).
- Multiplex over existing ControlMaster connections via `ssh -O forward` and `ssh -O cancel` when available, or spawn isolated `ssh -N -L` processes when standalone.
- Prevent port conflicts by verifying local port availability against Ports listener data.
- Track tunnel lifecycle states: `Open`, `Reconnecting`, `Failed(reason)`, and `Closed`.
- Auto-reconnect with exponential backoff on sleep wake, network changes, or dropped connections.
- Enforce production safety: Opening a tunnel to a production host requires explicit user confirmation.
- UI: Dedicated Tunnels panel under Servers (per-host view & global aggregate), one-click start/stop, template connection strings (e.g. `postgres://USER@127.0.0.1:5433/DB`, `redis://127.0.0.1:6380`), palette action integration, and menu bar tray status.

---

## 2. Data Model (`remote.json`)

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TunnelConfig {
    pub id: String,
    pub host_id: String,
    pub name: String,
    pub local_port: u16,
    #[serde(default = "default_remote_host")]
    pub remote_host: String,
    pub remote_port: u16,
    #[serde(default)]
    pub auto_start: bool,
}

fn default_remote_host() -> String {
    "127.0.0.1".to_string()
}
```

---

## 3. Tunnel Service Architecture (`src-tauri/src/services/remote/tunnel.rs`)

- **Port Validation:** Ports must be 1..=65535. `localPort` must bind to `127.0.0.1` only (never `0.0.0.0`). Local port check attempts loopback bind or checks listening sockets before launch.
- **Execution Strategy:**
  - If `ssh::control_check(&target)` is true: issue `ssh -O forward -L 127.0.0.1:<local>:<remote_host>:<remote_port> <target>`. On cancel: `ssh -O cancel`.
  - Otherwise: spawn `ssh -N -L 127.0.0.1:<local>:<remote_host>:<remote_port> <target>` with standard ControlOpts and track child process.
- **State Tracking:**
  `TunnelStatus: Open | Reconnecting { attempt: u32 } | Failed { reason: String } | Closed`
- **Journaling:** Every open/close event logged to `Store.journal`.
- **Cleanup on Quit:** All active tunnels (multiplexed forwards and spawned child processes) cancelled on app quit.

---

## 4. IPC Commands & Events

- `CMD.REMOTE_GET_TUNNELS` -> returns list of saved `TunnelConfig`s and active `TunnelStatus`es.
- `CMD.REMOTE_ADD_TUNNEL` -> creates a new tunnel config in `remote.json`.
- `CMD.REMOTE_UPDATE_TUNNEL` -> updates tunnel properties.
- `CMD.REMOTE_REMOVE_TUNNEL` -> closes and deletes tunnel.
- `CMD.REMOTE_OPEN_TUNNEL` -> starts forwarding (with confirm on prod host).
- `CMD.REMOTE_CLOSE_TUNNEL` -> stops forwarding.

---

## 5. UI Integration

- **Servers Tunnels View:** Host-specific and aggregate tunnel lists with state badges (green Open, yellow Reconnecting, red Failed).
- **Templates:** "Copy connection string" helper generating URI templates for Postgres, MySQL, Redis, Mongo, HTTP without injecting credentials.
- **Action Registry:** Dynamic actions for opening/closing configured tunnels in Command Palette (Cmd+K).
- **Tray Menu:** Active tunnels counter and quick close.

---

## 6. Verification

- Rust unit tests for argument generation, port validation, state transitions.
- Frontend schema tests and component tests.
- Full quality gates check: Oxlint, Prettier, TypeScript, Vitest, Cargo fmt, Clippy, Cargo test.
