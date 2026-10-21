# Phase 4: Servers Depth — Specification

> **Phase:** P4  
> **Target Branch:** `feat/mac-clean`  
> **Status:** Completed

---

## 1. Overview & Goals

Phase 4 expands the Servers module from a basic status/container list into a comprehensive server management suite:

1. **Timeline, Incidents & Notes (4.1):** Snapshot change detection ("What changed since you last looked"), incident lifecycle tracking for critical findings, and per-host markdown notes.
2. **Compose Stacks (4.2):** Group containers by `com.docker.compose.project`, with stack-level actions (`start`, `stop`, `restart`) preserving production safety gates.
3. **Nginx & Cron View (4.3):** Read-only inspection of Nginx virtual hosts, status, user crontab, and system cron jobs.
4. **Server Disk Cleanup (4.4):** Disk breakdown of Docker layers (`docker system df`), journal size, and safe pruning (builder cache, dangling images) with explicit reclaimed space confirmation.
5. **Merged Multi-Host Logs (4.5):** Streaming log aggregator combining remote containers, systemd journals, and local service logs with source badges and search filtering.
6. **SFTP File Browser (4.6):** Safe remote directory navigation, read-only preview of text files with automatic masking of secrets (`.env*`, `*.key`, `*.pem`), and secure download/upload.
7. **Remote Runbooks (4.7):** User-authored commands executed in visible terminal tabs, with checklist support and audit logging.

---

## 2. Backend Architecture (`src-tauri/src/services/remote/`)

- **`history.rs`:** Manages `remote-history.json` with rolling capped snapshot summaries, change detection diffs, and incident timestamps.
- **`notes.rs`:** Stores per-host markdown notes locally in `remote-notes.json`.
- **`compose.rs`:** Parses compose project metadata and prepares validated `docker compose -p <project> <action>` commands.
- **`files.rs`:** Directory listing parser and safe SFTP file fetch/upload via OpenSSH batch mode with path canonicalization.
- **`runbooks.rs`:** Manages saved commands in `remote-runbooks.json`.
- **Probe Extensions:** Adds Nginx sites, user cron, and Docker system df probes to `probe/script.sh`.

---

## 3. Frontend Architecture

- **Host Detail Tabs:** Adds `Timeline`, `Stacks`, `Logs`, `Files`, and `Notes` tabs.
- **Incident Timeline:** Visual timeline cards highlighting diffs and open/resolved incidents.
- **Compose Stacks View:** Grouped container accordion with bulk stack lifecycle controls.
- **Files Browser:** Navigable file tree with breadcrumbs, file size display, and masked secret preview.
- **Runbooks Runner:** Command palette integration and Host Detail quick-action buttons.

---

## 4. Verification

- Rust unit tests for diff engine, incident tracker, compose command builder, and path validation.
- Frontend schema tests and component tests.
- Full verification against quality gates.
