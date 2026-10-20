# Phase 0: Fix and Tidy What Exists — Specification

> **Phase:** P0  
> **Target Branch:** `feat/mac-clean`  
> **Status:** Implementing

---

## 1. Overview & Goals

Phase 0 addresses technical debt, inconsistencies, and stale documentation across the codebase before proceeding with subsequent roadmap phases. It establishes single sources of truth, aligns module categorization, clarifies the boundary between Doctor and Mac Clean, and adds auto-connection capability for remote servers.

---

## 2. Work Items

### 0.1 Terminal Cap Single Source (8)

- **Problem:** Frontend historically defaulted to 6 PTY sessions via `VITE_PTY_CAP`, while Rust allows 8 via `MAX_PTYS`.
- **Solution:** Rust's `get_app_context` returns `maxPtys: 8`. The frontend reads this cap from `AppContext` in `src/shared/tauri/schemas.ts` and updates `terminalsSlice`. `VITE_PTY_CAP` is retained only as an optional dev override.
- **Contract:**
  - Rust: `AppContext.max_ptys = crate::services::pty::MAX_PTYS` (8).
  - TypeScript: `appContextSchema` includes `maxPtys: z.number().int().positive().default(8)`.

### 0.2 "Everything" Preset Excludes Opt-In Modules

- **Problem:** The Welcome Screen "Everything" preset previously included `remote` (Servers), violating the rule that opt-in modules reaching outside the Mac must never be enabled unasked.
- **Solution:**
  - Derive `PRESETS` dynamically using `DEFAULT_MODULES` (which filters out `m.optIn`).
  - Welcome Screen displays opt-in modules in a distinct "Also available, turn on when you need them" row.
  - Vitest test ensures no preset contains an `optIn` module.

### 0.3 Stale Docs and Comments

- **`README.md`:** Add Servers and Mac Clean sections; rewrite Privacy section to explicitly state that network access is strictly limited to user-added servers over OpenSSH with their own keys.
- **`CLAUDE.md`:** Update architecture description with all six current modules and precise network boundaries.
- **`PRODUCT.md`:** Include remote server management in target use cases.
- **`src/shared/modules/modules.config.ts`:** Update "The four things" comment to reflect all modules.
- **`src-tauri/Cargo.toml`:** Update package `description`.
- **`FEATURES.md`:** Document terminal cap of 8 and revise latency descriptions.

### 0.4 Doctor / Mac Clean Boundary

- **Rule:** Doctor diagnoses, Mac Clean cleans.
- **Resolution:**
  - Doctor findings for disk/storage items retain diagnosis and explanations, with action buttons pointing to "Review in Mac Clean" (navigating to Storage with the category focused).
  - Memory/swap findings link to Mac Clean Memory tab.
  - Unique Doctor cleanup routines (VSCode orphaned extensions/caches, SQLite vacuum) remain in Doctor.

### 0.5 Sidebar Groups

- **Categorization:** Add `group: 'local' | 'remote' | 'mac' | 'tools'` to `ModuleDef`.
  - `homebrew`: `'local'`
  - `ports`: `'local'`
  - `remote`: `'remote'`
  - `doctor`: `'mac'`
  - `maclean`: `'mac'`
  - `claude`: `'tools'`
- **UI:** Render grouped section labels in sentence case (`Local`, `Remote`, `This Mac`, `Tools`) in `FeaturePicker` and grouped dividers in `NavRail`.
- **Shortcuts:** Maintain Cmd+1..N navigation order based on visible tabs.

### 0.6 Servers: Optional "Connect when Stackroost opens"

- **Data Model:** Add `autoConnect: boolean` (default `false`) to `Host` in Rust `remote_store.rs` and TS `remote.schema.ts`.
- **Startup:** On application boot, initiate non-interactive `BatchMode` connection probes for hosts marked `autoConnect == true`.
- **UI:** Add toggle switch in Host settings card with prominent warning copy for `prod` environment hosts.

---

## 3. Quality & Verification Gates

1. `npm run lint` & `npm run typecheck`
2. `npm test` (including new Vitest tests for presets, terminal cap, and groups)
3. `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
4. `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
5. `cargo test --manifest-path src-tauri/Cargo.toml`
6. `npm run build`
