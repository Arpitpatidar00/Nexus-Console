# Phase 5: Parity and Ship — Specification

> **Phase:** P5  
> **Target Branch:** `feat/mac-clean`  
> **Status:** Completed

---

## 1. Overview & Goals

Phase 5 introduces environment parity auditing and safe deployment workflows between local machines and remote servers:

1. **Environment Parity Auditor (5.1):** Compare runtime versions (Node, Python, Java, Docker, Postgres, Redis), `.env` key names, and container image drift across local workspace and remote servers. Detect secret cross-contamination ("staging using prod keys") via ephemeral salted HMAC-SHA256 without ever exposing secrets.
2. **Deploy, Promote & Rollback (5.2):** Pull-based compose deploy engine. Image digest preview before pulling, deploy tracking in `remote-deploys.json`, one-click rollback to previous digests, and "Promote Staging to Prod" with native confirmation.
3. **Push Local Image over SSH (5.3 - Teleport):** Safe image streaming (`docker save | gzip | ssh ... docker load`) for dev/staging environments. Architecture checking (e.g. ARM Mac vs x86 Linux) and strict refusal on production servers.

---

## 2. Backend Architecture (`src-tauri/src/services/remote/`)

- **`parity.rs`:**
  - Audits runtime versions across machines using non-interactive version flags.
  - Extracts local and remote `.env` keys (`cut -d= -f1`) without exposing values.
  - Computes `HMAC-SHA256(salt, value)` with a 32-byte ephemeral salt from `/dev/urandom` to detect cross-environment identical values.
  - Compares image digests and git commits across environments into a parity matrix.
- **`deploys.rs`:**
  - Manages `remote-deploys.json` storing historical deploy records, digests before/after, and status.
  - Generates deploy previews by inspecting compose service images.
  - Executes `docker compose pull && docker compose up -d` with structured logs and rollback capability.
  - Supports staging-to-prod promotion with digest diff and prod confirmation.
- **`teleport.rs`:**
  - Refuses execution on `env == Env::Prod`.
  - Compares `docker image inspect` architecture against remote `uname -m`.
  - Streams zipped image over SSH pipe into remote `docker load`.

---

## 3. IPC Commands

- `remote_audit_parity`: Compare local project and remote hosts.
- `remote_preview_deploy`: Inspect compose images for pending changes.
- `remote_execute_deploy`: Execute compose deploy on host and record digests.
- `remote_rollback_deploy`: Rollback service to previous digest from history.
- `remote_get_deploys`: Fetch deploy history for a host.
- `remote_promote_env`: Promote staging digests to production.
- `remote_push_image`: Push local container image to remote dev/staging server.

---

## 4. Safety Constraints

- Native NSAlert confirmations for all production deployments and promotions.
- Zero secrets transferred: HMAC comparison only transmits hashes; salt is discarded immediately.
- Refuse image teleportation on production servers.
