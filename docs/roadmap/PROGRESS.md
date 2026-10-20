# Roadmap v2 — Progress

> Agents: update this file at the end of every work session and every phase. The next session
> starts from the first unchecked item. Keep entries short and factual.

## Current status

- **Current phase:** P1 (ready to begin 1.1)
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
- [ ] **P1** Quick wins and safety
  - [ ] 1.1 Prod dead-man's switch (never kills a busy PTY)
  - [ ] 1.2 Detached-port detector
  - [ ] 1.3 Ports: project owner, open in browser, favourites
  - [ ] 1.4 Homebrew real health checks + port conflict warning
  - [ ] 1.5 Mac Clean mobile items + old installers + old screenshots
  - [ ] 1.6 Toolchain check
  - [ ] 1.7 Global hotkey
  - [ ] 1.8 Servers in menu bar
- [ ] **P2** Command palette + action registry
- [ ] **P3** SSH tunnels
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

- **2026-10-21:** Completed Phase 0 (0.1–0.6). Single-sourced terminal cap (8) from Rust AppContext, derived presets without optIn modules and added opt-in row on WelcomeScreen, refreshed stale docs across README/CLAUDE/PRODUCT/FEATURES/Cargo.toml, established Doctor / Mac Clean boundary with direct Review buttons, introduced sidebar groups (`local`, `remote`, `mac`, `tools`) with sentence-case section headers, and implemented optional auto-connect for remote servers with prod safety warning. All 213 Rust unit tests and 85 Vitest tests passing cleanly.
