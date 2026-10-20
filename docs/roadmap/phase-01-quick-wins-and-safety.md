# Phase 1: Quick Wins and Safety — Specification

> **Phase:** P1  
> **Target Branch:** `feat/mac-clean`  
> **Status:** Implementing

---

## 1. Overview & Goals

Phase 1 enhances system safety, developer productivity, and cross-module awareness across Stackroost.
Key capabilities include:

- A prod dead-man's switch protecting production servers against abandoned connections, while respecting long-running PTY jobs.
- Detached-port detection flagging orphan node/python/go servers holding dev ports.
- Ports upgrades: project owner detection, browser open probe, and favorite ports.
- Real Homebrew service health checks and pre-start port conflict detection.
- Extended Mac Clean catalog for mobile tools (Gradle, CocoaPods, Flutter, Xcode, Android) and old desktop screenshots/installers.
- Doctor toolchain versions and compatibility verification.
- Global show/hide hotkey.
- Menu-bar integration for connected servers.

---

## 2. Work Breakdown

### 1.1 Prod Dead-Man's Switch (Servers + Terminal)

- **Idle timer & screen lock:**
  - Screen lock / system sleep / idle timeout (5/10/30 min or off, default 10m).
  - Tray shows "PROD" badge when any production server is connected.
  - Action: close idle control masters via `ssh -O exit` and journal `Auto-disconnected (idle/locked)`.
- **PTY safety:**
  - Master fd check via `tcgetpgrp` vs shell pid. If foreground job is active (e.g. migration, build), do NOT kill: emit warning notification.
- **Files touched:**
  - `src-tauri/src/services/remote/deadman.rs` (new)
  - `src-tauri/src/services/pty/mod.rs`
  - `src-tauri/src/tray.rs`

### 1.2 Detached-Port Detector (Ports)

- **Classification:** Flag a listening port as `detached` if parent PID is 1, has no controlling TTY, is a known dev binary (`node`, `bun`, `vite`, `cargo`, `python`, etc.), and is not a system/Homebrew daemon.
- **Helper:** `src-tauri/src/util/proc.rs` process introspection.
- **UI:** Badge "Detached" with tooltip and standard Kill confirmation.

### 1.3 Ports Upgrades

- Project owner detection using `lsof -a -p <pid> -d cwd -Fn` mapped to known project directories.
- "Open in browser" HTTP test probe (`HEAD http://127.0.0.1:<port>` with 300ms timeout).
- Favorite ports: pinned to top and persisted in settings.

### 1.4 Homebrew Real Health Checks & Conflicts

- Health probes: `redis-cli PING`, `pg_isready`, `mysqladmin ping`, `mongosh` ping.
- Port conflict warning: check if formula port is currently in use before starting.

### 1.5 Mac Clean: Mobile Developers & Desktop Hygiene

- Mobile items: Gradle caches (`~/.gradle/caches`), CocoaPods cache, Flutter build folders, Xcode DeviceSupport, Android system images.
- Downloads installers (`.dmg/.pkg/.zip` > 30d) and desktop screenshots (> 30d) moved to Trash.

### 1.6 Toolchain Check (Doctor)

- Scope `system` / `toolchains`: verify versions of node, npm, pnpm, flutter, dart, java, rustc, python3, docker. Flag real mismatches.

### 1.7 Global Hotkey

- Optional global shortcut (e.g. Ctrl+Option+Space) to toggle window visibility.

### 1.8 Servers in Menu Bar

- Show connected hosts in tray menu with click-to-focus navigation.

---

## 3. Verification & Quality Gates

- `npm run lint` & `npm run typecheck`
- `npm test`
- `cargo fmt --check`
- `cargo clippy -- -D warnings`
- `cargo test`
- `npm run build`
