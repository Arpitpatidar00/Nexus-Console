# Phase 6: Local Data — Specification

> **Phase:** P6  
> **Target Branch:** `feat/mac-clean`  
> **Status:** Implementing

---

## 1. Overview & Goals

Phase 6 brings local developer data ergonomics directly into Stackroost:

1. **Local Docker Module (6.1):** Detects container runtime (Docker Desktop, OrbStack, Colima). Manages local containers, compose projects, logs, and interactive shell terminals.
2. **Databases Module (6.2):** Auto-discovers local databases from running Homebrew services, containers, and SSH tunnels. Schema browser, table row inspector, and safe SELECT-only query runner with automatic `LIMIT 500`.
3. **Branch Databases via APFS (6.3):** Instantaneous zero-copy Copy-on-Write (CoW) database snapshots via macOS `clonefile()`. Create, switch, and restore database branches for Postgres, MySQL, and Redis in seconds.

---

## 2. Backend Architecture (`src-tauri/src/services/`)

- **`services/local_docker/`:**
  - `runtime.rs`: Probes active engine via `docker context show` and `docker info`.
  - `containers.rs`: Native local container inspection and lifecycle commands (`start`, `stop`, `restart`, `remove`).
  - `compose.rs`: Local compose project grouping and stack actions.
- **`services/databases/`:**
  - `discovery.rs`: Scans Homebrew services (Postgres 5432, MySQL 3306, Redis 6379, MongoDB 27017) and active ports.
  - `classifier.rs`: Strictly verifies query safety. Rejects mutating statements (`DROP`, `DELETE`, `UPDATE`, `TRUNCATE`, `ALTER`, `COPY`, multi-statements) on read-only sessions.
  - `apfs.rs`: macOS `clonefile()` wrapper with APFS filesystem check (`statfs`). Manages database branches and snapshots.
  - `store.rs`: Persists saved database connections in `local-databases.json`.

---

## 3. IPC Commands

- `docker_runtime_status`: Check local container daemon status and engine kind.
- `docker_list_containers`: List local containers and compose stacks.
- `docker_container_action`: Perform start/stop/restart/remove on local container.
- `docker_compose_action`: Perform start/stop/restart on local compose project.
- `db_discover_connections`: Auto-discover running local database services.
- `db_list_connections`: List saved database connections.
- `db_add_connection`: Add manual database connection.
- `db_remove_connection`: Remove database connection.
- `db_introspect_schema`: Fetch tables, columns, and row estimates.
- `db_run_query`: Execute read-only query with `LIMIT 500`.
- `db_list_snapshots`: List APFS database branches and snapshot sizes.
- `db_create_snapshot`: Create APFS snapshot for a database.
- `db_restore_snapshot`: Restore database to a snapshot branch.

---

## 4. Safety Constraints

- Queries default strictly to read-only (`SELECT` only); mutating statements are blocked at AST/token classification.
- APFS branch cloning stops services cleanly before cloning to guarantee zero database corruption.
- Prod-tagged database connections can never enable write mode.
