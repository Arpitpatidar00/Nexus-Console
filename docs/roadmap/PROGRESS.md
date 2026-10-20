# Roadmap v2 — Progress

> Agents: update this file at the end of every work session and every phase. The next session
> starts from the first unchecked item. Keep entries short and factual.

## Current status

- **Current phase:** P11 (Dev Toolbox, Domains and Uptime, Secrets scanner)
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
- [x] **P4** Servers depth (timeline/notes, compose stacks, nginx/cron view, disk cleanup, merged logs, SFTP files, runbooks)
- [x] **P5** Parity and Ship (parity auditor, deploy/rollback, image push over SSH)
- [x] **P6** Local data (Local Docker, Databases, branch databases)
- [x] **P7** Projects and Workspaces (projects, GitHub — **ASK if gh missing**, workspaces, saved commands, terminal restore, time per project)
- [x] **P8** Claude Chats (search, resume, export, usage, context analysis)
- [x] **P9** Mac health (ghost leftovers, Energy, battery health + thermal, weekly trends, duplicate files)
- [x] **P10** Blueprint, Homebrew pin, auto-update
- [ ] **P11** Dev Toolbox, Domains and Uptime — **ASK (RDAP/resolvers)**, Secrets scanner
- [ ] **P12** Cloud (AWS) — **ASK**, Backups (incl. project .env), Network, chaos proxy
- [ ] **P13** Devices, App Releases (incl. crash rates) — **ASK**, local AI Explain

## Decisions from the user

- **2026-10-21 (Phase 5):** Auto-resolved ASK gates per instructions:
  - Deploy model: Standard Compose pull & up deployment pipeline with before/after image digest tracking in `remote-deploys.json`, one-click digest rollback, and staging-to-prod promotion protected by `ProdConfirmDialog` and native NSAlert.
  - Image push over SSH: Zero-dependency streaming pipe via `docker save | gzip | ssh ... gzip -d | docker load`. Architecture check verifies host compatibility (e.g. arm64 vs x86_64) before streaming. Strictly refused on production environments.
- **2026-10-21:** User directed to proceed without permission gates: "dont ask for the permissons and all just commit the thing and continue commit only dont push now". For 0.4, implemented boundary: Doctor diagnoses and provides "Review in Mac Clean" for disk and memory findings, while preserving unique Doctor cleanup tasks in Doctor.

- **2026-10-21 (Phase 10):** Auto-resolved ASK gates per instructions:
  - Blueprint format: Single unified JSON containing Brewfile dump string (`brew bundle dump --file=-`), remote hosts with private keys stripped, active tunnel configurations, project workspaces, saved commands, Mac Clean custom rules, and VS Code extensions. Visual diff engine highlights missing formulae, casks, taps, hosts, extensions, and workspaces. Step-by-step applying gives full control.
  - Homebrew pinning & rollback: Invokes native `brew pin` / `brew unpin`. Rollback scans Cellar keg directories (`/opt/homebrew/Cellar/<name>/*`) and switches keg symlinks via `brew switch` / symlink relink, with an honest warning when previous versions are not retained.
  - Software updates: Safe queries to GitHub Releases API with no auto-installing or background binary overwrite; clear release notes and direct link to download.

## Deviations from the plan

_(none in P0)_

## Known limitations

_(none in P0)_

## Session log

- **2026-10-21:** Completed Phase 9 (Mac Health).
  - 9.1: Ghost Leftovers scanner in `services/maclean/ghost.rs` identifying orphaned Caches, Preferences, Saved Application State, HTTPStorages, and dead LaunchAgents whose binaries no longer exist. Application Support remnants flagged as possible (reveal only). Safe removal to Trash.
  - 9.2: Energy Accounting in `services/maclean/energy.rs` with `proc_pid_rusage` flavor 4 measuring idle wakeups, interrupt wakeups, CPU time, and disk writes. Power source detection (`pmset -g batt`), category grouping (Apps, Services, Watchers, System), and honest unplugged pause suggestion with dedicated `EnergyPage.tsx` tab.
  - 9.3: Doctor battery health (`ioreg AppleSmartBattery`) and thermal throttling (`pmset -g therm`) probes in `services/doctor/system.rs` reporting cycle count, max capacity %, condition, and top CPU consumers when throttling is active.
  - 9.4: 90-day rolling daily trends in `services/maclean/trends.rs` persisting to `maclean-history.json`, computing week-over-week free space deltas and fastest growing categories in `WeeklyTrendsCard.tsx`.
  - 9.5: Report-first duplicate files finder in `services/maclean/duplicates.rs` using BLAKE3 (exact size grouping -> 64 KB partial hash -> full hash) for files >= 1 MB in Downloads, Desktop, Documents with side-by-side selection and move to Trash in `DuplicateFilesCard.tsx`.
  - Quality gates: 255 Rust tests pass, 115 Vitest tests pass, 0 oxlint warnings/errors, prettier clean, tsc clean, bundle built in 717ms.

- **2026-10-21:** Completed Phase 8 (Claude Chats upgrades).
  - 8.1 Full-Text Search: High-performance search across all project session transcripts (`.jsonl`) with keyword match snippet extraction and direct navigation.
  - 8.2 Resume in Terminal: Copy or spawn `claude --resume <sessionId>` in the interactive terminal drawer scoped to the project working directory with strict UUID validation.
  - 8.3 Markdown Export: One-click export of complex multi-turn coding chats into clean, readable GitHub-flavored markdown with collapsible tool call sections.
  - 8.4 Token Usage & Costs: Aggregates input tokens, output tokens, and cache read tokens to display estimated spend per project based on Claude 3.5 Sonnet pricing.
  - 8.5 Context Window Analysis: Inspects active context load, categorizes token consumption (tool outputs, assistant reasoning, user prompts), and provides proactive recommendations (/compact or new chat) when approaching context limits.
  - Quality gates green: 248 Rust unit tests pass (0 failures), 111 Vitest frontend tests pass, Oxlint (0 errors/warnings on 523 files), Prettier, TypeScript, and Vite production bundle build.

- **2026-10-21:** Completed Phase 7 (Projects and Workspaces).
  - 7.1 Projects module: Automatic recursive discovery of git repositories under project roots, framework detection (Next.js, Vite, Node, Rust, Go, Flutter, Python), dirty file counter, ahead/behind upstream tracking, stash counter, last commit metadata, and one-click merged branch cleanup.
  - 7.1 GitHub Integration: Graceful read-only detection using `gh` CLI for open PRs and CI status checks without requiring third-party OAuth keys.
  - 7.2 Workspace Orchestration: Unified workspace definitions linking projects to Homebrew services, local Docker compose stacks, SSH tunnels, and auto-VS Code opening. Start and stop operations with strict ownership tracking so workspace shutdowns never kill pre-existing user services.
  - 7.3 Saved Commands: Project-scoped authoring and execution of shell commands in the interactive terminal drawer.
  - Quality gates green: 248 Rust unit tests pass (0 failures), 108 Vitest frontend tests pass, Oxlint (0 errors/warnings on 520 files), Prettier, TypeScript, and Vite production bundle build.

- **2026-10-21:** Completed Phase 10 (Blueprint and maintenance).
  - 10.1 Nexus Blueprint: Unified macOS & developer environment export/import (`NexusBlueprint`). Exports Brewfile, sanitized remote hosts, tunnels, workspaces, saved drawer commands, Mac Clean rules, and VS Code extensions. Diff analysis reports missing packages, taps, hosts, extensions with step-by-step application UI.
  - 10.2 Homebrew Pinning & Keg Rollback: Formula pinning preventing accidental upgrades during `brew upgrade`. Cellar keg inspector enumerates retained local keg versions with one-click rollback.
  - 10.3 In-App Update Checker: GitHub Releases integration displaying installed vs latest version, release notes, and release assets download link.
  - Quality gates green: 256 Rust unit tests pass, 118 Vitest tests pass, Oxlint (0 errors/warnings on 544 files), Prettier, TypeScript, and Vite production bundle build.

- **2026-10-21:** Completed Phase 6 (Local data).
  - 6.1 Local Docker module: Probing container engines (OrbStack, Docker Desktop, Colima), native container lifecycle actions (start, stop, restart, remove), compose stacks view with project-level controls, zero system prune -a to protect Mac Clean boundaries.
  - 6.2 Databases module: Auto-discovery of local database instances (Postgres, MySQL, Redis, MongoDB), schema & tables browser, read-only SQL query execution with AST/token classification, anti-mutation guarantees (blocking DROP/DELETE/UPDATE/ALTER/COPY and multi-statement attacks), and automatic LIMIT 500 pagination.
  - 6.3 APFS Instant Database Branches: Instantaneous zero-copy Copy-on-Write (CoW) snapshots using macOS clonefile() on database data directories, safe service shutdown before cloning to ensure filesystem consistency, real disk size tracking with du, and one-click rollback/restore.
  - Quality gates green: 247 Rust unit tests pass (0 failures), 102 Vitest frontend tests pass, Oxlint (0 errors/warnings on 509 files), Prettier, TypeScript, and Vite production bundle build.

- **2026-10-21:** Completed Phase 5 (Parity and Ship).
  - 5.1 Environment Parity Auditor: Toolchain runtime version matrix (Node, Python, Docker, Compose, Postgres, Redis) comparing local machine and remote servers. `.env` key names comparison across machines without value exposure. Ephemeral 32-byte salted HMAC-SHA256 comparison (`openssl dgst -sha256 -hmac`) detecting cross-environment secret leaks ("staging using prod keys") with instant salt disposal.
  - 5.2 Deploy, Promote & Rollback: Pull-based compose deploy engine with image digest preview before pulling. Persistent deploy history in `remote-deploys.json`. One-click rollback that re-tags previous digests and redeploys. Staging-to-production promotion with diff preview, double-confirmation (`ProdConfirmDialog` + native NSAlert on prod).
  - 5.3 Image Teleportation: Push local images directly to dev and staging servers over SSH stream without requiring a remote registry. CPU architecture validation prevents running ARM Mac binaries on x86 servers. Hard barrier refusal for production servers.
  - Quality gates green: 240 Rust unit tests pass (0 failures), 100 Vitest frontend tests pass, Oxlint (0 errors/warnings on 496 files), Prettier, TypeScript, and Vite production bundle build.

- **2026-10-21:** Completed Phase 4 (Servers depth).
  - 4.1 Timeline, Incidents & Notes: Rolling capped snapshot summaries, automated change diff engine (detecting new/removed/restarted containers, image changes, disk growth >= 5%, and unit failures), critical incident lifecycle tracker (first seen, last seen, resolved), and per-host markdown scratchpad notes with instant save and local persistence (`remote-notes.json`, `remote-history.json`).
  - 4.2 Compose Stacks: Grouping containers by `com.docker.compose.project`, stack-level start/stop/restart controls, health badges, CPU/RAM metrics, and production double-confirm dialog (`ProdConfirmDialog`).
  - 4.3 Nginx & Cron Inspection: Read-only virtual host parsing (enabled/available sites, listen ports, server names, SSL, upstream proxy passes), active daemon status, user and system crontab parsing, and configuration reload instructions.
  - 4.4 Server Disk Cleanup: `docker system df` layer space inspector (images, containers, local volumes, build cache with reclaimable percentages), per-container log size analyzer, and safe pruning operations for builder cache and dangling images with reclaimed bytes banner.
  - 4.5 Merged Logs: Unified log aggregator with container filter pills, error stream formatting, search filter, and 1-click live log stream terminal launcher.
  - 4.6 SFTP File Browser: Remote filesystem explorer with breadcrumb navigation, quick directory bookmarks (`/var/log`, `/etc`, `/home`), file metadata (permissions, size, modified), and preview pane with automatic secret masking (`.env*`, `*.pem`, `*.key`) and reveal toggle.
  - 4.7 Remote Runbooks: Host and project-scoped saved terminal commands (`remote-runbooks.json`), modal authoring dialog, one-click execution that focuses/spawns remote shell terminal sessions, and clipboard command copying.
  - Quality gates green: 233 Rust unit tests pass (0 failures), 99 Vitest frontend tests pass, Oxlint (0 errors/warnings on 487 files), Prettier, TypeScript, and Vite production bundle build.

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
