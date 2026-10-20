# Roadmap v2 — Progress

> Agents: update this file at the end of every work session and every phase. The next session
> starts from the first unchecked item. Keep entries short and factual.

## Current status

- **Current phase:** P4 (Servers depth)
- **Branch:** feat/mac-clean
- **Waiting on user:** —

## Phases

- [x] **P0** Fix and tidy what exists
  - [x] 0.1 Terminal cap single source (8)
  - [x] 0.2 Presets exclude opt-in modules
  - [x] 0.3 Stale docs and comments (README privacy, CLAUDE.md, PRODUCT.md, modules comment, Cargo description, FEATURES.md)
  - [x] 0.4 Doctor / Mac Clean boundary — Doctor diagnoses, Mac Clean cleans (Review in Mac Clean links added)
  - [x] 0.5 Sidebar groups (Local, Remote, This Mac, Tools)
  - [x] 0.6 Servers "Connect when Stackroost opens" (off by default)
- [x] **P1** Quick wins and safety
  - [x] 1.1 Prod dead-man's switch (never kills a busy PTY)
  - [x] 1.2 Detached-port detector
  - [x] 1.3 Ports: project owner, open in browser, favourites
  - [x] 1.4 Homebrew real health checks + port conflict warning
  - [x] 1.5 Mac Clean mobile items + old installers + old screenshots
  - [x] 1.6 Toolchain check
  - [x] 1.7 Global hotkey
  - [x] 1.8 Servers in menu bar
- [x] **P2** Command palette + action registry
- [x] **P3** SSH tunnels
- [ ] **P4** Servers depth (timeline/notes, compose stacks, nginx/cron view, disk cleanup, merged logs, SFTP files, runbooks)
- [ ] **P5** Parity and Ship (parity auditor, deploy/rollback — **ASK**, image push — **ASK**)
- [ ] **P6** Local data (Local Docker, Databases, branch databases)
- [ ] **P7** Projects and Workspaces (projects, GitHub — **ASK if gh missing**, workspaces, saved commands, terminal restore, time per project)
- [ ] **P8** Claude Chats (search, resume, export, usage, context analysis)
- [ ] **P9** Mac health (ghost leftovers, Energy, battery health + thermal, weekly trends, duplicate files)
- [ ] **P10** Blueprint, Homebrew pin, auto-update — **ASK**
- [ ] **P11** Dev Toolbox, Domains and Uptime — **ASK (RDAP/resolvers)**, Secrets scanner
- [ ] **P12** Cloud (AWS) — **ASK**, Backups (incl. project .env), Network, chaos proxy
- [ ] **P13** Devices, App Releases (incl. crash rates) — **ASK**, local AI Explain

## Decisions from the user

- **2026-10-21:** User directed to proceed without permission gates: "dont ask for the permissons and all just commit the thing and continue commit only dont push now". For 0.4, implemented boundary: Doctor diagnoses and provides "Review in Mac Clean" for disk and memory findings, while preserving unique Doctor cleanup tasks in Doctor.

## Deviations from the plan

_(none in P0)_

## Known limitations

_(none in P0)_

## Session log

- **2026-10-21:** Completed Phase 3 (SSH tunnels).
  - Data model and persistence: `TunnelConfig` in `remote.json` via `Store.tunnels`, `new_tunnel_id()`.
  - Tunnel service in `services/remote/tunnel.rs` with `TunnelManager`: local loopback port conflict validation, multiplexed forwarding via `ssh -O forward` / `ssh -O cancel` on active ControlMaster, standalone fallback via `ssh -N -L`, state tracking (`Open`, `Reconnecting`, `Failed`, `Closed`), and connection template generator (Postgres, MySQL, Redis, Mongo, HTTP).
  - Safety & confirmations: production tunnels require native confirmation before opening; all tunnels cleanly closed on app quit; open and close events logged to journal.
  - UI: `TunnelsPanel` integrated into Servers `HostDetail` with state badges, one-click start/stop, one-click connection string copy with checkmark feedback, `AddTunnelDialog`, and dynamic actions in Action Registry / Cmd+K.
  - All quality gates green: 97 Vitest tests, 226 Rust tests, Oxlint, Prettier, TypeScript, Vite build, cargo fmt, and cargo clippy.

- **2026-10-21:** Completed Phase 2 (Command palette + action registry).
  - Built centralized Action Registry in `src/shared/actions/` with `types.ts`, `scorer.ts`, `staticActions.ts`, `useDynamicActions.ts`, and `useActions.ts`.
  - Zero-dependency fuzzy scoring algorithm with exact, prefix, word boundary, and keyword boosting (tested via Vitest).
  - Integrated command palette in `CommandDialog.tsx` with full keyboard navigation (↑/↓/Enter/Esc), recent actions stored in `localStorage` (capped at 5), grouped section displays, and danger action styling with native confirm preservation.
  - All quality gates green: Oxlint, Prettier, TypeScript, 94 Vitest tests, Vite build, cargo fmt, cargo clippy, and 222 Rust tests.

- **2026-10-21:** Completed Phase 1 (1.1–1.8).
  - 1.1: Prod dead-man's switch implemented in `services/remote/deadman.rs` monitoring screen lock (`com.apple.screenIsLocked`), system sleep, and configurable idle timeout. PTY foreground job protection via `tcgetpgrp` vs shell pid (tested with real PTY `sleep 5`), `[PROD]` tray indicator, and header warning.
  - 1.2: Detached-port detector via `util/proc.rs` classifying orphaned dev processes (PPID 1, no tty) with Detached badges and kill confirm.
  - 1.3: Ports upgrades: process working directory project ownership, on-demand HTTP browser open probe (`CMD.PROBE_PORT_HTTP`), and pinned favorite ports.
  - 1.4: Real Homebrew health checks (`redis-cli PING`, `pg_isready`, `mysqladmin ping`, `mongosh` ping with 2s timeout) and pre-start port conflict detection.
  - 1.5: Mac Clean catalog extended with Gradle, CocoaPods, idle Flutter builds, iOS DeviceSupport, Android system images, and old installers / screenshots safely moved to `~/.Trash`.
  - 1.6: Doctor toolchain check verifying Node, npm, pnpm, Rust, Python, Docker, Flutter, Dart, CocoaPods, Xcode versions.
  - 1.7: Global show/hide hotkey powered by `tauri-plugin-global-shortcut`.
  - 1.8: Connected servers submenu in tray with status dot and click-to-open.
  - All 222 Rust unit tests and 85 Vitest tests pass cleanly. Prettier and Oxlint verified.

- **2026-10-21:** Completed Phase 0 (0.1–0.6). Single-sourced terminal cap (8) from Rust AppContext, derived presets without optIn modules and added opt-in row on WelcomeScreen, refreshed stale docs across README/CLAUDE/PRODUCT/FEATURES/Cargo.toml, established Doctor / Mac Clean boundary with direct Review buttons, introduced sidebar groups (`local`, `remote`, `mac`, `tools`) with sentence-case section headers, and implemented optional auto-connect for remote servers with prod safety warning. All 213 Rust unit tests and 85 Vitest tests passing cleanly.
