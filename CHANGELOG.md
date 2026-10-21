# Changelog

Generated from commit history by `npm run changelog` — do not edit by hand.

## Unreleased

### Added

- **audit:** complete Phase F product improvement (F.1-F.8)
- **audit:** complete Phase E architecture consolidation (E.1-E.7)
- **audit:** complete Phase C tests and verification
- **audit:** complete Phase B truth remediations (T-09..T-15, P-03, P-06)
- **audit:** complete Phase A safety foundations, S1 defect fixes, and guard tests
- **audit:** complete Phase 0 baseline, freeze unsafe features, and docs (0.1-0.6)
- **roadmap:** complete Phase 13 devices releases and local ai explain
- **roadmap:** complete Phase 12 cloud backups and network
- **roadmap:** complete Phase 11 dev toolbox and security
- **roadmap:** complete Phase 10 blueprint and maintenance
- **roadmap:** complete Phase 9 mac health
- **roadmap:** complete Phase 8 claude chats upgrades
- **roadmap:** complete Phase 7 projects and workspaces
- **roadmap:** complete Phase 6 local data
- **roadmap:** complete Phase 5 parity and ship
- **roadmap:** complete Phase 4 servers depth
- **roadmap:** complete Phase 3 SSH tunnels
- **roadmap:** complete Phase 2 command palette and action registry
- **roadmap:** complete Phase 1 quick wins and safety
- **roadmap:** complete Phase 0 (0.1–0.6) fix and tidy
- **ui:** redesign entire UI with Stackroost Smoked Glass design system
- **maclean:** P6 scheduled cleanup + low-disk warning (opt-in, tray)
- **maclean:** P5 deep scan, drill-down, large files, simulators, backups
- **maclean:** P4 Memory tab — composition, pressure, swap, top apps
- **maclean:** P3 Storage tab, Mac Clean module, rules in Settings
- **maclean:** P2 clean engine — whitelisted items, safe_rm, one confirm, journal
- **maclean:** P1 storage report (read side) — mac-clean.sh as data
- **remote:** P7 background health, Check all, CPU/RAM sparklines
- **remote:** P6 SSH testbed + integration tests; fix ControlPath length
- **remote:** P5 docker actions, journal, remote terminals
- **remote:** P4 frontend — Servers module, consent, import, host detail
- **remote:** P3 findings — rules over HostSnapshot
- **remote:** P2 probe — probe.sh, section parsers, remote_snapshot
- **remote:** P1 ssh core — store, transport, config scan, host commands

### Fixed

- **audit:** complete Phase D partial features and verification
- **build:** align @tauri-apps/api and @tauri-apps/cli to 2.12 to match tauri crate
- **ui:** add top window controls spacer to prevent sidebar collision with close and minimize buttons
- **ui:** upgrade sidebar tooltip to radix portal with smoked glass styling

### Changed

- **backend:** restructure src-tauri into production commands, services, models, database, and core layers
- modularize frontend, clean unused assets, and rename app to Stackroost

### Docs

- **roadmap:** refresh README and FEATURES for full roadmap v2 completion
- FEATURES.md — every feature, end to end, in one file

## 0.1.0 — 2026-10-18

### Other

- Ignore real-machine doctor tests in CI
- Removed fixtures
- Updated readme
- Fixed rust warnings
- Added feature screen, Modular architecture & bug fixes
- Fixed brew lock flags
- Prettier fixes
- App cleanup & optimisation
- Repo setup
