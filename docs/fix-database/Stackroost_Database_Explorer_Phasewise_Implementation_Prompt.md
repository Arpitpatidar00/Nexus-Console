# Stackroost Database Explorer — Phase-Wise Implementation Master Prompt

## Mission

You are the implementation agent for the existing **Stackroost Database Explorer** repository. Use the completed audit as the starting evidence, but verify all material claims against the current working tree before changing code. Improve the feature in small, dependency-aware phases toward production-grade group-based, multi-engine database exploration, trustworthy cross-database relationships, seamless navigation, and measurable reliability.

The target is high practical production quality—not an arbitrary “100/10” score, a broad rewrite, or architecture for its own sake. Preserve current working functionality unless a specific requirement below justifies changing it.

**Implement the phases in order. After each phase, run its tests and verification gates, inspect the diff, and record evidence. Do not quietly proceed past a failed gate.** If a blocker requires a product decision, destructive action, new external service, dependency with significant cost, or migration behavior not specified here, stop and report the exact decision needed. Otherwise continue through the phases without asking redundant questions.

---

## 1. Current-State Context From the Audit

The audit describes the current feature as an advanced prototype/single-database inspector with an experimental multi-database map. The reported stack and behavior are:

- Frontend: React, TypeScript, TanStack Query, Tauri IPC.
- Backend: Rust/Tauri commands and a JSON-backed local connection store.
- Credential storage: macOS Keychain entries keyed by connection ID; database credentials should not be persisted in the JSON connection store.
- Existing engines/adapters: PostgreSQL, MySQL, MongoDB, and Redis, implemented through CLI-based introspection.
- Existing UI areas: `ExplorerSidebar`, `DatabasesPage`, `MapView`, `DiagramCanvas`, `TableView`, `SchemaView`, `DocumentsView`, and `DocumentCard`.
- Existing relationship code: `src/features/databases/utils/relations.ts`; graph construction/layout is in or near `diagram.ts`.
- Existing persistence/commands: `src-tauri/src/services/databases/store.rs` and `src-tauri/src/commands/databases.rs`.
- The audit reports a flat connection list, no groups, no connection-edit command, heuristic cross-database links, missing cross-database context in table details, unbounded schema-fetch concurrency, and stale query data after connection removal.
- Audit evidence also reports that MongoDB schema information is sampled from documents and that MongoDB and Redis do not currently provide the same native relation metadata as relational engines.

These are **starting claims, not unquestionable facts**. Re-open the current code and verify paths, types, command signatures, tests, scripts, and actual behavior before implementing. The repository may have changed since the audit.

### Known target behavior

A user can create a logical workspace/group such as `Fameo`, then add multiple database connections:

- Main Database — PostgreSQL
- Auth Service — PostgreSQL
- Chat Service — MongoDB
- E-commerce Service — MongoDB
- Audit Service — PostgreSQL

This is an illustrative configuration, not a claim about Fameo's actual production infrastructure. Groups must support any combination of engines that Stackroost explicitly supports. A group is a logical organizing and relationship scope; it is not a shared database, a distributed transaction, or proof of referential integrity.

When the user selects a group, show only that group's connections on its unified map and infer relationships only among eligible connections in that group. When the user selects one connection, show only that connection's schema/collections and single-database exploration views. From a table or collection, the user can inspect and navigate to an explicitly configured or inferred relationship in another connection in the same group, with provenance and confidence/ambiguity made clear.

---

## 1A. Verified Repository Facts and Constraints (checked 2026-10-26)

These were verified against the working tree; still re-check before editing. `CLAUDE.md` at the repo root is authoritative and overrides this prompt where they disagree. Ignore `.claude/rules/*` that describe the Nexus ERP stack (NestJS/Prisma/MUI/pnpm); they do not apply here.

### Tooling (use exactly these)

- Package manager: **npm** (`package-lock.json`). Never introduce pnpm/yarn files.
- `npm run typecheck` · `npm run lint` (oxlint, not eslint) · `npm test` (vitest) · `npm run format`
- `cargo fmt --manifest-path src-tauri/Cargo.toml` · `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` · `cargo test --manifest-path src-tauri/Cargo.toml`
- Vitest runs in a **node** environment (no jsdom). `@testing-library/react` is **not installed**. "Component tests" in this prompt mean one of: (a) extract the logic (navigation reducer, relationship resolver, group filtering) into pure functions and test those — the repo's established pattern; or (b) **stop and ask** before adding `jsdom` + `@testing-library/react` (a dependency decision under Rule 10).
- Architecture guard tests live in `src-tauri/tests/guards.rs` (`guard_mutations_gated`, `guard_no_shell_commands`, `guard_no_ignored_outputs`, `guard_no_browser_confirms`). They must keep passing.

### Contracts every new or changed command must satisfy

1. `#[tauri::command]` in `src-tauri/src/commands/databases.rs`, returning `AppResult<T>`; DTOs `#[serde(rename_all = "camelCase")]`; shell-outs are `async` + `commands::blocking`.
2. Registered in `src-tauri/src/lib.rs` `generate_handler![...]`.
3. Name added to `CMD` in `src/shared/tauri/commands.ts` (no raw invoke strings).
4. A zod schema mirroring the DTO field-for-field in `src/features/databases/api/*.schema.ts`; frontend calls go through `ipc`/`ipcVoid`.

- Every mutating command takes a `MutationGuard` (`core::mutation::mutation` / `mutation_unattended`). Destructive ones (delete group _with_ connections, remove connection) use `mutation(...)` with `.destructive(true)` — a native NSAlert. Never `window.confirm`/`window.alert`.
- Inputs are validated in Rust with `core::validate` newtypes (`HostName`, `Port`, `DbUser`, `DbName`, …). Never build a shell string; use `core::exec::run` argv with a timeout.
- Persistence goes through `core::store::load_store`/`save_store` (atomic, `{version,data}` envelope, a corrupt file is moved aside, not overwritten). New fields need `#[serde(default)]` for legacy stores. No hand-rolled `fs::write`.
- The `db_` prefix is already mapped to the `databases` module in `core/capabilities.rs`; a new non-`db_` prefix must be mapped there.
- Any outbound connection (including a new ping/health check) must call `core::net::check_outbound_allowed`. A `db_hosts` destination is already declared in `core/net.rs`.
- Periodic work (for example health polling) must be a job on `services::scheduler` (one thread, 10 s tick, `due()` cadence, pauses on low battery). Never spawn a new loop thread.
- React Compiler is enabled. Do not hand-add `useMemo`/`useCallback` only for memoization.
- Styling uses semantic tokens (`bg-canvas`, `text-fg`, `text-warning`, …). No raw hex or palette classes (`src/styles/tokens.guard.test.ts` enforces this). Read `PRODUCT.md` before any UI change.
- Error toasts are central (`app/queryClient.ts`); explorer queries use `meta: { silent: true }` and render `ErrorPanel` instead.

### Audit corrections (verified)

- **Cross-DB jump does not "crash"**: `DatabasesPage` passes only `linksOf(schema)` of the active DB to `TableView`, so cross-DB links never reach `DocumentCard`. The defect is _missing_ navigation. `MapView`'s `onOpenTable` already takes `(connectionId, key)`; only the detail-view `OpenTable` type lacks `connectionId`.
- **`crossDbLinks` does not re-run on pan/zoom/hover/search**: that state lives inside `DiagramCanvas` (`view`, `hover`, `find`). Do not add `useMemo` to `MapView` for this; only optimize a measured bottleneck.
- **Bound concurrency in Rust, not JS**: `commands::blocking` is `tauri::async_runtime::spawn_blocking`. Put one counting limiter (max 3) around `explorer::schema` in `db_schema` so every caller is bounded. No `p-limit`.
- **IDs**: there is no `uuid` crate. Reuse the existing `/dev/urandom` hex ID pattern (`src-tauri/src/database/remote_store.rs` `new_host_id`/`new_tunnel_id`), or generate under the store lock and retry until unique.
- **Redux Toolkit already exists** (`shared/state`) for UI/intent state; React Query owns everything from Rust. Do not introduce another state library.

### Additional defects found during verification (fold them into Phase 1 / Phase 6)

- **ISS-10** `db_set_password` is registered in `lib.rs` but has no `CMD` entry and no frontend caller, no mutation gate, and no ID validation. It escapes `guard_mutations_gated` because `set` is not a guard keyword. Remove it; password changes go through the gated `db_update_connection`.
- **ISS-11** `db_add_connection` ignores a Keychain write failure (`let _ = keychain::set_password(...)`), so a connection can be saved without its password. Propagate the error and record `guard.failure` before saving.
- **ISS-12** `db_add_connection` does not validate `driver` (or `env`) in Rust; an unsupported driver is persisted and fails only at schema time.
- **ISS-13** `db_schema`/`db_browse`/`db_run_query` never call `check_outbound_allowed`, even though `db_hosts` is declared.
- **ISS-14** `services/databases/store.rs` has no unit tests. `api/contracts.test.ts` has goldens for postgres, mysql and browse only — add Mongo and Redis.
- **ISS-08 detail**: on removal, evict both `dbKeys.schema(id)` and every `[...dbKeys.all, 'browse', id]` query.

### Phase numbering vs. the audit report

The audit report (`Report.md`) uses Phases 0–5; this prompt uses 0–8. Mapping: report P1 → prompt P1; report P2 → prompt P2 + P3; report P3 → prompt P4; report P4 → prompt P5; report P5 → prompt P6–P8. **Follow this prompt's numbering.**

---

## 1B. Additional Implementation Requirements (verified against the code)

### Existing behavior that must be preserved

- **Prod is always read-only.** `db_add_connection` and `db_run_query` force `allow_writes = false` when `env` is `prod`/`production`. `db_update_connection` must apply the same rule in Rust; the UI toggle alone is not enough.
- **Keychain account names are `db_conn_{id}`** (service `com.stackroost.app`, `core::keychain`). Existing connection IDs must never be rewritten during migration, or saved passwords become unreachable. A new ID format applies only to newly created connections.
- **Tunnels belong to the Servers module.** `tunnel_id` is resolved through `RemoteState` (`resolve_endpoint` in `commands/databases.rs`). Group or connection operations must never create, edit or delete tunnels. An edit that points at a missing tunnel must fail validation instead of silently dialing `host:port`.
- **APFS branches (`dataDir`, Snapshots/Branches tab)** are tied to the connection, not the group. Moving or editing a connection must not touch snapshots. Deleting a connection must not delete snapshot directories.
- **Discovery quick-add** (`quickAdd` in `DatabasesPage.tsx`) must keep working. A quick-added connection goes into the currently selected group, or Ungrouped when none is selected.
- **Driver aliases:** the dialog sends `mongodb`, while older stores and the explorer also accept `mongo`. Treat both as MongoDB everywhere, and do not rewrite stored values unless a tested migration requires it.
- **Mongo filter matching is deliberately loose today.** `mongo.rs` `candidates()` matches a typed value as a string, a number, a boolean, or an ObjectId when it is 24 hex characters. Keep this for manually typed filters. Cross-database jumps (Phase 4) must send the value typed according to the resolved relationship, and must not rely on this guessing to make an incompatible mapping look like it works.
- **The store file is written with `sensitive = true` (0600).** New group and mapping data goes into the same `local-databases.json` with `#[serde(default)]` fields, unless a separate file is clearly justified.

### Where engine checks live today (Phase 2 input)

Driver-string checks (`driver === 'redis'`, `driver.startsWith('mongo')`, `isRedis`…) are spread across:
`pages/DatabasesPage.tsx` (7), `components/DocumentsView/DocumentsView.tsx` (11), `components/DatabaseOverview/DatabaseOverview.tsx` (8), `components/TableView/TableView.tsx` (6). A capability map (Phase 2) should replace these in one place rather than adding more.

### State ownership for new data

| Data                                                   | Owner                                                                                                             |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Groups, membership, confirmed/rejected mappings        | Rust store → React Query (`dbKeys.groups()`, `dbKeys.relations(groupId)` — add these to `api/keys.ts`)            |
| Schemas, browse pages, health status                   | React Query, keyed by connection ID                                                                               |
| Expanded/collapsed groups, last active group           | UI-only. Component state, or the existing Redux `ui` slice if it must survive a restart. Never in the Rust store. |
| Navigation trail (group → connection → table → filter) | Local to `DatabasesPage` (a `useReducer` with a pure, unit-tested reducer). No new global store.                  |

After any group, membership or mapping mutation, invalidate `dbKeys.connections()`, `dbKeys.groups()` and the affected `dbKeys.relations(groupId)`.

### Error and redaction

- Explorer errors come from CLI stderr (`AppError::Shell(format!("database query error: {stderr}"))` and `explorer::cli_output`). Pass user-facing error text through `services::secrets::redact_secrets_in_text` before returning it. `core::diag::redact` already covers the diagnostics report.
- Passwords are passed via env (`PGPASSWORD`, `MYSQL_PWD`, `REDISCLI_AUTH`, `STACKROOST_MONGO_USER/PASS`). Never move a credential into argv; `ps` can read argv.

### Existing tests to keep green (Phase 0 baseline)

- Frontend: `api/contracts.test.ts`, `api/databases.schema.test.ts`, `utils/relations.test.ts`, `utils/diagram.test.ts`, `utils/exporters.test.ts`, `components/QueryEditor/QueryEditor.test.ts`.
- Rust: `explorer_contracts_golden` in `services/databases/explorer/mod.rs` writes `fixtures/databases/explorer-contracts.json`, which `contracts.test.ts` checks. When a DTO changes, regenerate the golden through that test rather than editing the JSON by hand. Add Mongo and Redis entries (ISS-14).
- Architecture guards: `src-tauri/tests/guards.rs`.
- `npm run test:machine` runs `#[ignore]`d tests that need a real machine. `scripts/remote-testbed` is an SSH testbed for the Servers module, **not** a database testbed.

### No E2E harness exists

There is no Tauri E2E or Playwright setup. Cover the "E2E-xx" scenarios with Rust service tests, pure-logic Vitest tests, and a manual run with `npm start` (`npm run dev` is browser-only and every IPC call fails). Report anything that needs live databases as `NOT VERIFIED` unless disposable local Homebrew databases are available, and never point tests at the user's real `local-databases.json`.

### Measuring the concurrency cap

Have the Rust limiter expose its in-flight and peak counts behind `#[cfg(test)]` (or a debug-only accessor). Prove `peak <= 3` with a test that runs more than 10 concurrent fake introspections. Do not count processes with `ps` in tests.

### Decisions that require stopping to ask

- Adding `jsdom` / `@testing-library/react` or any other new dependency.
- A group-delete policy other than "keep connections → Ungrouped" (the default).
- Any change to the on-disk store format beyond additive `#[serde(default)]` fields.
- Allowing cross-group mappings (out of scope).

### Delivery and git workflow

- Work on a feature branch off `main` (not `fix/servers-feature`). Make one commit per phase using Conventional Commits, for example `feat(databases): group-based connections (phase 1)`.
- Let the lefthook hooks run; never use `LEFTHOOK=0`. Do not push or open a PR unless asked.
- Write each phase's completion report to `docs/fix-database/phase-N-report.md` in the format given under **Completion Report Format**, and update `Report.md`'s issue register (mark each ISS-xx `CLOSED` with the commit hash).

---

## 2. Non-Negotiable Engineering Rules

1. **Verify before editing.** Inspect the working tree, current source, and project scripts. Do not rely only on this prompt or the earlier audit.
2. **Keep the change set scoped.** Do not rewrite unrelated features, change the visual design system wholesale, or replace working adapters without evidence that it is necessary.
3. **Do not silently misrepresent relationships.** A name-based heuristic is a candidate, not proof. Never label an inferred link as a database-enforced foreign key.
4. **Never silently discard ambiguity.** If a source could match multiple targets, represent the candidates and require user selection/confirmation rather than dropping the relationship or choosing arbitrarily.
5. **Preserve user data.** Any connection-store format change must be backward-compatible or include a tested, recoverable migration. Never delete existing connections, credentials, groups, mappings, or snapshots as an implicit side effect.
6. **Protect secrets.** Do not persist passwords in frontend state, logs, diagnostics, exports, or plaintext JSON. Continue using the established secure credential mechanism unless an evidence-backed change is needed. Redact connection URLs and other secrets from error output.
7. **Respect engine differences.** PostgreSQL/MySQL foreign keys, MongoDB `_id`/document references, and Redis keys are not interchangeable. Use explicit engine capabilities and honest UI labels. Do not pretend all engines support the same query/filter/relationship operations.
8. **Bound external work.** Bound concurrent schema introspections and health checks. Apply timeouts, cleanup, cancellation/stale-result protection where supported, and partial-failure handling.
9. **No success by assertion.** Tests, builds, typechecks, security checks, and performance thresholds may only be marked passed if actually run and their result is captured. If the environment cannot run a check, mark it `NOT VERIFIED` and explain why.
10. **No speculative dependency.** Use existing libraries and patterns where suitable. Add dependencies only when the benefit is material, the current options are inadequate, and the new dependency's compatibility and maintenance implications are checked.
11. **Keep read-only behavior safe.** Do not introduce writes into database engines or loosen existing read-only protections as part of this work. If current code has write-capable paths, preserve their established authorization/guard behavior and do not broaden it.
12. **Review every phase's diff.** Look for accidental formatting churn, changes outside scope, leaked secrets, removed behavior, migrations that lose data, and tests that merely assert implementation details rather than behavior.
13. **No arbitrary 100% coverage mandate.** Aim for complete coverage of critical logic and required edge cases. Report line coverage separately if measured; passing a percentage does not replace acceptance testing.

---

## 3. Required Working Protocol

### Before Phase 0

- Confirm the repository root and working-tree status.
- Identify all relevant source files and actual paths.
- Inspect `package.json` and the package manager/lockfile to discover the real test, lint, typecheck, and build scripts.
- Inspect `Cargo.toml`/workspace layout and discover the real Rust formatting, test, and build commands.
- Determine the available Tauri/runtime environment and which checks can execute here.
- Run the existing relevant checks before changing code when safe.
- Capture baseline failures. Do not attribute pre-existing failures to your changes.
- Do not run commands that delete user data or mutate live databases.

### For every phase

Record:

1. Phase goal and the files/modules actually changed.
2. Design decisions and why they are necessary.
3. Tests added or updated.
4. Exact commands executed and their outcomes.
5. Manual/UI verification performed, including platform/environment.
6. Edge cases tested and their observed results.
7. Diff review outcome and any remaining risks.
8. Phase verdict: `PASS`, `PASS WITH LIMITATIONS`, or `BLOCKED`.

A phase is not complete solely because code compiles. Its behavioral acceptance criteria must also be demonstrated at the appropriate test level.

### If a check fails

- Stop and diagnose the failure before moving to the next dependent phase.
- Fix failures caused by the change and rerun the relevant checks.
- If a failure is pre-existing, capture reproducible evidence and isolate it from the new changes where possible.
- Do not weaken tests, remove assertions, hide errors, or mark the phase passed to maintain momentum.
- If blocked by missing credentials/services/platform access, add deterministic mock/fixture coverage where appropriate, document what it proves, and leave the unavailable real integration check as `NOT VERIFIED`.

---

# Phase 0 — Baseline, Contracts, Fixtures, and Regression Safety

## Objective

Establish a trustworthy baseline and a repeatable test harness before altering persistent data models or cross-database behavior.

## Work

1. Verify the current implementation and audit findings against the working tree.
2. Inventory relevant modules, command contracts, existing schema types, driver capabilities, React Query keys, state ownership, keychain handling, and current tests.
3. Inspect actual package/Rust scripts and run all feasible existing targeted checks.
4. Add or improve deterministic fixtures for a multi-service group with mixed engines. Prefer mocked schema metadata over requiring live database instances for unit tests.
5. Create fixture cases representing:
   - PostgreSQL relational tables and native foreign keys.
   - MySQL relational tables and native foreign keys.
   - MongoDB collections with `_id` values and sampled field types.
   - Redis keyspace metadata and its actual supported capabilities.
   - Repeated table/collection names across services.
   - Missing metadata and failed schema loads.
6. Define test helpers for source and target connection identities, schema metadata, inferred candidates, explicit mappings, and navigation context.
7. Record the actual baseline of tests, lint, formatting, typecheck, build, and currently available integration tests.
8. Use the existing test list and guard tests in Section 1B as the baseline set. Store fixtures go under `fixtures/databases/` next to the existing `explorer-contracts.json`.

## Required edge cases

- Empty connection store.
- Legacy connection store without group fields.
- Unknown/extra persisted fields where serialization behavior permits them.
- A schema load returns an error rather than data.
- Two connections have the same display name but different IDs.
- Connections point to different supported engines.
- Test fixtures never contain real credentials.

## Tests and verification

- Rust unit tests for current store serialization/deserialization, if available.
- Frontend unit tests for current relation and diagram utility behavior.
- TypeScript typecheck and existing frontend test suite.
- Rust formatting/test checks using scripts/commands confirmed from the repository.
- Confirm that tests use deterministic fixtures and do not require a production database.
- Record baseline failures before making feature changes.

## Acceptance gate

- A baseline report exists with real commands and results.
- Critical behavior can be tested deterministically.
- No product code behavior has changed except minimal test infrastructure.
- Any existing failure is documented accurately.

**Do not proceed to Phase 1 until the baseline and fixture approach are understood.**

---

# Phase 1 — Group-Based Workspace and Connection Management

## Objective

Replace the flat-only connection experience with group-aware management while preserving existing saved connections and secure credentials.

## Scope

### Persistent model

Inspect the current `DbStore` and `DbConnection` types before editing. Add a stable group model and group membership to connections using the smallest compatible change. A suitable conceptual model includes:

- Group: stable ID, name, optional description/appearance metadata only if useful, creation/update metadata if consistent with existing conventions.
- Connection: stable ID, group association, name, driver, endpoint/configuration, environment, and other already-supported settings.
- A well-defined ungrouped/legacy state so older stores load safely.

Use collision-resistant IDs consistent with project dependencies and Rust conventions. Replace timestamp-only IDs if the code confirms the reported collision issue. Avoid adding fields with no current product use.

### Commands and API contracts

Implement or update the minimum required command/API operations for:

- List groups.
- Create group.
- Rename/update group.
- Delete group with an explicit policy for its connections.
- Assign/move a connection to a group.
- Update connection configuration.
- Add/remove a connection.

Use actual naming conventions discovered in the code. Update frontend schemas, hooks, query keys, and Tauri command registration consistently. Validate group IDs, connection IDs, required fields, duplicate names if the current UX requires handling them, and invalid inputs on the backend boundary—not only in UI controls.

Connection editing must not remove and recreate the connection as a workaround. The edit keeps the same ID (and so the same `db_conn_{id}` Keychain entry), re-applies the prod read-only rule, re-validates host/port/user/database/driver/tunnel in Rust, and on success evicts `dbKeys.schema(id)`, the browse queries and the health state for that ID. If the password did not change, preserve its Keychain entry. If the password changed, update the secure credential entry with a well-defined failure/rollback strategy. If endpoint identity changes, verify cache and health-state invalidation.

### Pre-existing defects to fix in this phase

- Remove the ungated `db_set_password` command (ISS-10) from `commands/databases.rs` and `lib.rs`.
- Propagate the Keychain write failure in `db_add_connection` (ISS-11), and apply the same rule in `db_update_connection`.
- Validate `driver` against the drivers `explorer::schema` supports, and validate `env`, in Rust on add and update (ISS-12).
- Make connection IDs collision-free (Section 1A, IDs) and add the missing `store.rs` unit tests (ISS-14).
- Evict schema and browse queries for a removed connection (ISS-08).

### Sidebar behavior

Implement a group hierarchy in the database sidebar:

- Create, rename, and expand/collapse a group.
- Add a connection directly into a selected group.
- Move an existing connection between groups.
- Edit connection configuration.
- Delete a connection with confirmation appropriate to the operation.
- Open a selected connection in its single-database view.
- Open a group's unified map.
- Show connection engine and environment labels using existing design patterns.
- Provide empty, loading, error, and ungrouped states.

Do not allow a click on a group row to accidentally behave like a click on a child connection. Preserve keyboard navigation and meaningful accessible labels.

### Group delete semantics

A group deletion must explicitly offer a safe policy, such as:

1. Delete the group and keep its connections in an ungrouped bucket; or
2. Delete the group and its connections, with clear destructive confirmation and complete dependent cleanup.

Never silently cascade-delete connections. If the project/product decision is unclear, implement the safer keep-connections behavior by default and document it. Deleting a connection must remove its connection-specific cache and safely reconcile any saved mappings, while cleaning its credential only when appropriate and supported by the current secure storage contract.

### Legacy store migration

Older JSON stores must load without losing connections. Assign pre-existing connections to a virtual/actual `Ungrouped` bucket until the user organizes them. The implementation can use a virtual bucket if that best preserves compatibility; avoid writing an unnecessary permanent group unless needed.

Ensure atomic/robust persistence if the existing storage layer supports a safe strategy. Do not overwrite a valid store with an empty store after a parse/read error.

## Required end cases

1. Fresh install with no groups or connections.
2. Load a legacy `local-databases.json` with connections but no groups.
3. Create `Fameo`; add PostgreSQL, MongoDB, and Redis connections to it.
4. Create a second group; ensure the sidebar and all selectors keep the groups isolated.
5. Rename a group and verify its connections remain attached by stable ID.
6. Move a connection from one group to another.
7. Edit a host/port/database/user without changing the password; verify the secret remains available and no duplicate connection is created.
8. Change a password and simulate secure-store failure; confirm no silent configuration/credential mismatch is introduced.
9. Delete a group using each supported policy; confirm no unintended connection or keychain loss.
10. Delete a connection while it is selected, while its schema query is in flight, and while it is present in a graph.
11. Create connections rapidly; verify unique IDs.
12. Restart/reload the app; verify groups, memberships, and connection metadata persist.
13. Attempt invalid group and connection IDs through command/API boundaries.

## Tests and verification

- Rust unit tests for create/update/delete/move operations and store migration.
- Serialization round-trip tests for current and legacy store formats.
- Tests for stable/unique group and connection IDs.
- Command-level tests where the Tauri setup supports them, or isolated service tests around command logic.
- Frontend tests for group accordion actions, active selection, move-to-group, connection editing, empty state, and delete confirmation.
- Regression tests proving old connections remain visible and usable after migration.
- Manually inspect the persisted JSON using credentials removed/redacted; confirm no password is present.
- Inspect Keychain-related logic without printing secrets.
- Run the Phase 0 checks again.

## Acceptance gate

- A legacy user can open the app without data loss or a manual migration.
- Group CRUD and connection assignment survive restart.
- Group deletion has explicit, tested semantics.
- Connection editing preserves secure credential behavior.
- The sidebar supports multiple groups with heterogeneous engines.
- No credentials appear in the JSON store, frontend state intended for non-secret metadata, logs, or test output.

---

# Phase 2 — Engine Capability Contract and Mixed-Engine Correctness

## Objective

Make the existing PostgreSQL, MySQL, MongoDB, and Redis support explicit and honest across group maps, schema, relationships, browsing, and navigation.

## Work

1. Inspect the existing engine-neutral contracts (`DbSchema`, table/collection metadata, columns, relation structures, browse/filter requests) and the four adapters.
2. Preserve current adapters unless evidence shows a correctness defect. Do not replace CLI-based adapters with native drivers merely for architectural style.
3. Identify which capabilities each engine actually supports today: tables/collections/keyspaces, native FK metadata, type metadata, indexes, browsing, filtering, pagination, sort, read-only guarantees, and health check behavior.
4. Add or refine a small typed capability representation only for real capability differences that current UI/API behavior needs. Avoid broad framework abstractions.
5. Make the UI and relationship engine consume actual capabilities rather than infer them from engine display names in many unrelated components.
6. Mark MongoDB schema details as sampled/observed if the adapter infers shapes from a limited document sample. Do not represent sampled fields as a complete schema guarantee.
7. Represent Redis relationships according to its real supported metadata; do not manufacture table-style foreign keys from arbitrary key names.
8. Ensure schema/collection identifiers remain unique and stable across connections. A schema/table key alone is not globally unique; cross-database identity must include the connection ID.
9. Validate filters and value conversions per engine. Never implicitly convert arbitrary integers/strings into BSON ObjectIds or imply type compatibility where it has not been established.

## Required end cases

- One group mixes all currently supported engines.
- Two connections use the same engine but different database names.
- Two groups have matching table and collection names; no cross-group relationship is allowed.
- A PostgreSQL FK is shown as a database-declared relation, distinct from cross-database guesses.
- MongoDB collection has inconsistent field types across sampled documents.
- MongoDB `_id` is an ObjectId in one case and a string in another.
- Redis key patterns exist that resemble table names or foreign keys; they must not be treated as confirmed relational constraints.
- An engine does not support a feature such as native FK introspection; the UI explains unavailability instead of showing an empty result as proof that no relation exists.
- A connection uses a driver value not recognized by the current build; the UI/API returns a controlled unsupported-engine error, not a crash.

## Tests and verification

- Unit tests for engine capability declarations and typed identifiers.
- Adapter contract tests using fixtures or safe test databases where available.
- Cross-engine filter serialization and type compatibility tests.
- Tests that unsupported operations return a structured, user-understandable result.
- Verify read-only protections remain intact for every adapter and no new write command is introduced.
- Verify current single-database browsing/diagram flows still work for all supported engines.

## Acceptance gate

- The product never implies all engines have the same schema or relationship guarantees.
- Every supported engine continues to load and browse its supported metadata.
- Unsupported capabilities are explicit and do not crash or silently fabricate data.
- All identity references used across the app include connection identity where needed.

---

# Phase 3 — Trustworthy Cross-Database Relationship Detection and Persistence

## Objective

Replace brittle name-only linking with a typed, explainable relationship model that distinguishes database-enforced constraints from guesses and user-configured application references.

## Domain rules

Implement a clear distinction between:

1. **Declared local relationship** — supplied by an engine's real constraint metadata, where supported.
2. **Inferred candidate** — generated by heuristics and not yet confirmed.
3. **User-configured/confirmed application relationship** — explicitly selected and persisted by the user; not a database-enforced foreign key.
4. **Rejected candidate** — a candidate the user dismissed, so it does not reappear as if new unless source metadata materially changes and product rules explicitly allow reevaluation.
5. **Stale or unresolved mapping** — a saved mapping whose connection, table, or column no longer exists or whose metadata cannot currently be verified.
6. **Ambiguous candidate set** — multiple plausible targets exist; do not choose a winner silently.

Keep automatic candidates derived from current metadata where practical. Persist explicit mappings and rejections as user decisions. Avoid permanently storing every transient heuristic candidate unless the existing persistence/UX requirements genuinely require it.

A saved mapping should carry stable ID and endpoint identity fields at least sufficient to identify group, source connection, source schema/collection, source table/field, target connection, target schema/collection, and target table/field. Follow the repository's existing serialization conventions. Ensure mapping endpoints belong to the same group unless the product explicitly supports cross-group mapping (it does not for this scope).

## Detection behavior

1. Use naming conventions (`user_id`, `userId`, `_uuid`, etc.) only to generate candidates.
2. Search only connections in the active group.
3. Evaluate all viable candidates rather than dropping the result when target count is not exactly one.
4. Normalize column/field/table names using a documented, tested rule without destroying case-sensitive identifiers.
5. Use available engine/type metadata to classify compatibility. At minimum distinguish compatible, incompatible, and unknown rather than pretending unknown means compatible.
6. Handle the fact that PostgreSQL UUID, integers, strings, MongoDB ObjectIds, and Redis keys have different semantics. A string-to-ObjectId mapping may be allowed only when explicitly configured and the concrete value can be safely validated/converted by the target adapter; never assume arbitrary string/ObjectId equality.
7. Treat a local table with a similar name as a separate candidate decision, not an unconditional reason to suppress every external candidate. Preserve the distinction between a local relationship and an application-level cross-service reference.
8. Support multiple candidate targets and explain why each target was suggested: name match, compatible type, primary-key match, configured mapping, or another grounded signal.
9. Recompute candidates when schemas/group membership change, while preserving user-confirmed mappings by stable IDs where valid.
10. Detect and present stale references instead of silently dropping them.

## UI behavior

- Give each relation a clear provenance label: `Declared`, `Inferred`, or `Configured`.
- Distinguish confidence/compatibility from confirmation state. Do not use a confidence number unless its calculation is documented and validated; simple reason labels may be better.
- Ambiguous candidates must show the candidate destinations and allow the user to select the intended destination or reject the suggestions.
- Confirmed mappings can be edited or removed.
- Rejected candidates should not reappear immediately on every render.
- Graph styling must distinguish declared/internal links from inferred, ambiguous, and configured cross-database links accessibly—not by color alone.
- Provide legend/filter behavior for relevant statuses.
- Clicking a link should reveal its source, target, engine types, provenance, current status, and any incompatibility warning.

## Required end cases

1. Exactly one plausible target exists.
2. No plausible target exists.
3. Two or more compatible targets exist; candidate set is displayed.
4. Candidates exist but types are incompatible.
5. Type information is missing or sampled; state is `unknown` rather than silently compatible.
6. `orders.user_id` may match two separate `users` tables in different connections in the same group.
7. A local `users` table exists alongside an external `auth.users` candidate.
8. A similarly named candidate exists only in another group; no cross-group edge appears.
9. User confirms a candidate, closes/reopens the app, and sees the persisted mapping.
10. User rejects a candidate and it stays suppressed under the documented rule.
11. Source or target table/column is renamed or removed; saved mapping becomes stale/unresolved and offers a recovery path rather than silently pointing elsewhere.
12. A connection is moved between groups while it has a saved mapping; prevent cross-group leakage and reconcile/reject the move safely with clear explanation.
13. Engine schema refresh changes the target field type.
14. Two source columns map to the same target column; mapping identity remains unambiguous.
15. Composite keys or multi-field relationships appear. If unsupported, state that limitation clearly and prevent a misleading partial mapping.
16. Identifiers include case-sensitive names, spaces, schema prefixes, collection names, or reserved characters.
17. Heuristic detection must not run repeatedly on every pan/zoom, selection, or search keystroke if its inputs have not changed.

## Tests and verification

- Unit tests for candidate generation, identity normalization, type classification, ambiguity, local-vs-external behavior, and group isolation.
- Property/table-driven tests for naming variants and type combinations.
- Persistence tests for explicit mappings and rejected candidates.
- Migration/round-trip tests for the connection store with and without mappings.
- Tests for stale mappings after schema and group changes.
- UI tests for selecting/rejecting/confirming an ambiguous mapping and explaining provenance.
- Assert explicitly that ambiguous matches are not silently omitted and arbitrary targets are never auto-selected.
- Check deterministic output ordering so graph state does not flicker across renders.

## Acceptance gate

- Every displayed cross-database edge has provenance and a visible state.
- No ambiguous candidate is silently discarded or selected at random.
- Type incompatibility and unknown compatibility are represented distinctly.
- User-confirmed mappings persist and are independent from ephemeral heuristic results.
- Group boundaries are enforced by the relationship resolver and its tests.
- Existing local foreign-key behavior remains correct.

---

# Phase 4 — Cross-Database Context, Detail Views, and Navigation

## Objective

Keep relationship context intact from the group map through single-connection and table/collection views, and make cross-database navigation predictable and reversible.

## Work

1. Trace current navigation state in `DatabasesPage` and all callers of `onOpenTable` or equivalent.
2. Define a typed navigation contract that distinguishes at least:
   - Active group ID.
   - Active connection ID.
   - Current view mode: group map, connection explorer, or table/collection detail.
   - Table/collection identity scoped to connection.
   - Breadcrumb/back trail and any supported filter/page state.
3. Avoid adding a new state library unless the current approach demonstrably cannot meet the contract. Implement the trail as a pure reducer local to `DatabasesPage` (see Section 1B, state ownership) and unit-test it in Vitest. Centralize the minimum shared navigation state and avoid duplicate competing sources of truth.
4. Extend the relevant navigation callback to include the destination connection ID, table/collection identity, and a typed optional filter only when safe/supported.
5. Feed the same group-scoped relationship model into `TableView`, `SchemaView`, `DocumentsView`, and `DocumentCard`; do not independently re-infer the same relationships in every component.
6. In Schema, show local and external relationships with target connection and field details plus provenance/status.
7. In Relations, show neighbors across databases when known and applicable, clearly grouped by connection.
8. In document/row browsing, show cross-database navigation only if the mapping is usable. Use engine-specific filter builders and type-aware values. Do not query the wrong connection or silently coerce incompatible IDs.
9. Breadcrumbs should represent `Group > Connection > Table/Collection`. Back navigation must restore the relevant prior context when feasible, including filters and pagination state.
10. If a target is offline, inaccessible, stale, or incompatible, show a controlled error and allow the user to recover without losing source context.
11. Prevent stale async loads from a previous connection/group replacing the newly selected view.

## Required end cases

1. Group map → table node → detail view.
2. Group map → source table → external target → Back returns to exact source table.
3. Source row with configured external relationship → target query uses correct connection and compatible filter.
4. Inferred-but-unconfirmed relationship is visible as a candidate but is not presented as a guaranteed direct row jump unless the UI clearly labels the experimental action and user explicitly chooses it.
5. Destination engine cannot express the filter type safely; disable the jump with a useful reason.
6. Destination connection is disconnected or credentials expire.
7. Destination table was renamed or removed after the source detail view loaded.
8. Switch group while old table and schema requests are still pending.
9. Open two tables with identical names in different connections; context stays correctly scoped.
10. Navigate between PostgreSQL and MongoDB and back.
11. No cross-database link exists; local table browsing remains unchanged.
12. Deep navigation and browser/app back action do not create invalid trails or loops.
13. Connection removed while currently in its table view; show a safe fallback instead of a blank/crashed view.
14. Selected map and view state survive group rename without binding to stale group names.

## Tests and verification

- Component tests for each view displaying local, inferred, ambiguous, configured, stale, and unavailable relationships.
- Navigation reducer/state tests for push, back, replace, group switching, and deleted destinations.
- Integration tests that simulate group map → source table → target table → back.
- Tests confirming `connectionId` is included in every cross-connection navigation path.
- Query tests to verify filters use the intended target engine and the correct typed value.
- Verify existing single-database views and keyboard/mouse navigation still behave as before.
- Manual UI check of breadcrumbs, tabs, relationship labels, empty states, loading states, errors, and return navigation.

## Acceptance gate

- All table/collection identifiers and navigation targets are connection-scoped.
- Cross-database context remains visible and consistent in all relevant detail views.
- Back/breadcrumb navigation returns to the correct prior view without unintended state loss.
- Invalid/unavailable mappings fail safely and do not run a query against an unintended database.

---

# Phase 5 — Bounded Concurrency, Caching, Connection Health, and Recovery

## Objective

Make group schema loading and connection state robust under slow or failing connections, without generating uncontrolled CLI processes or stale UI state.

## Work

### Bounded schema loading

- Inspect how `useDbSchemas` / `useQueries` currently requests schemas and how Rust commands spawn blocking work.
- Implement a single clear concurrency limit for schema introspection **in Rust around `explorer::schema` in `db_schema`** (see Section 1A). Use the audit's proposed initial maximum of **3 simultaneous schema introspections** as the starting target, then verify that the actual number of child processes is bounded. Avoid multiple nested limiters that deadlock or serialize unnecessarily.
- Do not fetch schemas from groups that are not active. Fetch only what's necessary for the current view.
- If a connection fails, preserve successfully loaded schemas from other connections and show partial group results.
- Support cancellation where the process/API truly supports it. Where a spawned CLI process cannot be cancelled safely, use process lifecycle management and stale-result guards rather than pretending cancellation happened.

### Timeouts and resource lifecycle

- Set documented, configurable or consistently chosen timeouts based on existing conventions.
- Ensure child processes are reaped/terminated as appropriate and resources are closed on timeout, application shutdown, and connection removal.
- Use a consistent error contract that distinguishes authentication failure, network/timeout, unsupported engine/operation, invalid configuration, and partial metadata failure without leaking secrets.
- Add retry behavior only where safe and bounded. Do not create unbounded retry loops or retry an authentication failure repeatedly.

### Connection health

- Add a lightweight health-check command only after inspecting the current adapter and CLI options. It must go through `core::exec::run` with a timeout, call `check_outbound_allowed` (ISS-13), and, if periodic, run as a `services::scheduler` job.
- Use the least expensive engine-appropriate operation (for example `SELECT 1` or `PING` only where appropriate and safe); do not run a full schema introspection just to paint a status dot.
- Health states should distinguish at least `idle/unknown`, `checking`, `reachable`, and `failed`, with a safe description of the last error category where useful.
- Avoid polling aggressively. Debounce/manual refresh or a modest policy consistent with existing product patterns is preferred.
- A health check must not expose credentials or leave long-lived processes behind.

### Cache correctness

- Audit React Query keys, stale times, invalidation, removal, and races.
- Remove schema/health/relationship queries when a connection is removed; invalidate relevant group-level map and relation queries when group membership, schema, or explicit mappings change.
- A group switch must not show another group's cached map or relationships.
- Avoid deleting reusable cache entries if they are still valid for another active subscriber; align query identity with connection and relevant metadata version.
- Treat renamed/moved/removed connections and mapping endpoints as invalidation events.

### Expensive calculations

- Memoize derived relationships and graph layout only where inputs are stable and the computation is expensive. The React Compiler already memoizes components; do not hand-add `useMemo` without a measured need.
- Ensure pan/zoom, hover, and search-state updates do not re-run schema introspection or full relationship detection unnecessarily.
- Use stable node/edge IDs, deterministic output, and targeted recomputation when appropriate.
- Do not add workers/virtualization unless measurement demonstrates they are needed.

## Required end cases

1. Opening a group with 10 or more connections never exceeds the configured maximum number of simultaneous schema-introspection processes.
2. One slow connection does not prevent healthy connections from loading.
3. One failed database produces a partial map with visible status rather than failing the whole group.
4. A request times out; the user can retry and the old child process/resources do not leak.
5. A group switch occurs while schema A is loading; its result cannot overwrite group B's current state.
6. Delete a connection while schema loading is in flight; its stale result cannot repopulate the deleted connection's UI/cache.
7. Rapidly select several connections; the final active selection remains correct.
8. Remove a connection and recreate a new one; old schema/relationship data is not reused by ID collision or stale cache.
9. A health check fails and then succeeds; status recovers without re-adding the connection.
10. Authentication errors do not trigger excessive automatic retries.
11. Empty cache, stale cache, refresh, and schema changed since last load.
12. The user pans, zooms, hovers, or types in graph search; expensive relationship computation is not repeated unless its inputs changed.
13. App restart/shutdown while a command is pending; ensure graceful process/resource handling as supported by the platform.

## Tests and verification

- Unit tests for the concurrency limiter and request coordination.
- Instrumented/mock adapter test that tracks maximum concurrent introspections and proves it never exceeds the configured cap.
- Tests for timeout/retry classification and cleanup behavior.
- React Query tests for invalidation/removal after group/connection/mapping changes.
- Race-condition tests for switching groups and deleting selected connections during an in-flight request.
- Health command tests using safe mocks and live disposable databases only where available.
- Performance test/measurement showing relation generation is not re-run on irrelevant rerenders.
- Manual test with at least 10 mocked or available connections, including one unreachable connection.

## Acceptance gate

- Measured concurrent schema introspections never exceed the configured cap.
- Failed connections do not block healthy group entries.
- Deleting/moving connections or switching groups cannot resurrect stale results.
- Health checks are lightweight and do not expose secrets.
- Cache entries are correctly invalidated and removed.
- Performance claims are based on measurements, not assumptions.

---

# Phase 6 — Security and Safe Failure Behavior

## Objective

Verify that group management and new cross-database capabilities do not weaken existing credential handling, authorization boundaries, read-only behavior, or error safety.

## Work

1. Trace the complete path of credentials from connection dialog to Rust command, secure store, CLI environment, error handling, and frontend display.
2. Keep passwords and secret-bearing connection parameters out of `local-databases.json`, React Query data, console output, telemetry, export files, and user-facing errors.
3. Ensure frontend commands cannot use arbitrary group/connection IDs to access a connection outside the current local-user/workspace scope. Apply backend validation at every relevant boundary.
4. Validate host, port, database, driver, tunnel, and other connection options. Assess SSRF/untrusted-host risks appropriate to a desktop app that opens user-provided endpoints; document any boundary assumptions rather than asserting a web-server-only threat model.
5. Preserve TLS certificate verification behavior and avoid introducing insecure defaults.
6. Confirm read-only query/session restrictions remain in place for all supported adapters and that health checks are non-destructive.
7. Redact secrets from CLI stderr/stdout before surfacing errors; avoid logging complete command lines if they can contain sensitive endpoint data.
8. Ensure explicit relationship configuration cannot be used to trigger unsafe writes; relationship browsing should remain read-only under existing product rules.
9. Ensure group deletion and connection removal have explicit scopes and do not accidentally delete unrelated Keychain items or mappings.
10. Inspect export behavior and ensure schema/graph export cannot include connection credentials or other secret configuration.
11. Confirm ISS-10 to ISS-13 are closed: no ungated Keychain writer, no ignored Keychain error, driver/env validated in Rust, and `check_outbound_allowed` called before every DB connection.

## Required end cases

- Invalid host/port and malformed driver settings.
- CLI emits an error that includes a password or credential-like argument; user-facing output/log must redact it.
- Secure-store read/write/delete fails.
- Connection edit changes only non-secret fields.
- Connection edit changes the secret but secure-store update fails.
- User removes one connection while other connections have Keychain secrets; only the intended secret is affected.
- Group delete uses the “keep connections” path and does not remove credentials.
- Group delete uses the destructive path and removes only the selected group's connections and their intended credentials after confirmation.
- Unsupported/unauthorized target navigation attempts are handled safely.
- Read-only adapter operation receives a malformed or unsupported filter; it must fail safely rather than perform a write.
- Export graph/schema with errors or sensitive metadata present; secret configuration must not be included.
- No credentials appear in debug output or test snapshots.

## Tests and verification

- Unit tests for redaction utilities and error mapping.
- Store tests asserting serialized connection metadata has no password/secret fields.
- Mocked secure-store failure tests for add/edit/remove rollback behavior.
- Tests for group/connection scoping and invalid IDs.
- Review adapter commands/queries for read-only protections.
- Automated scans for obvious secret leakage where the repository has suitable tooling.
- Inspect the final diff and generated fixtures to ensure no real credentials were committed.
- Live security checks requiring actual databases or macOS Keychain must be performed only in an appropriate environment; otherwise mark them `NOT VERIFIED` and state the limitation.

## Acceptance gate

- No confirmed regression in credential handling or read-only protections.
- User-facing and diagnostic errors do not disclose credentials.
- Destructive actions have explicit scope and confirmation.
- All unverified platform-specific security checks are reported honestly.

---

# Phase 7 — Final UX Integration, Accessibility, and Regression Hardening

## Objective

Ensure the group and cross-database workflows feel like one coherent feature rather than a collection of disconnected components.

## Work

1. Align group and connection controls with existing design-system components and styling. Do not perform a wholesale visual redesign.
2. Ensure the sidebar communicates group hierarchy, connection name, supported engine, environment, and connection state without clutter.
3. Make active scope obvious: `Group Map`, `Single Connection`, or `Table/Collection Detail`.
4. Add breadcrumbs in the form `Group > Connection > Table/Collection` and ensure each interactive segment has correct behavior.
5. Add concise empty and partial states, such as “No connections in this group,” “Schema unavailable,” “Some connections failed to load,” or “No confirmed relation; candidate matches available.”
6. Provide a graph legend and filters that distinguish supported relationship classes and statuses. Do not rely on color alone; add text/icons/accessible labels.
7. Ensure keyboard operation, focus management for dialogs/menus, accessible labels, visible focus indicators, and appropriate screen-reader announcements for health/error state changes.
8. Make search/filter results scoped to the currently selected group or connection and label the scope. Do not search unrelated groups when the user is in a single-group map unless the UI explicitly asks for global search.
9. Ensure the group map and single-connection map do not look identical in ways that confuse their scopes.
10. Review loading behavior so the user can distinguish “no relationships” from “relationship detection not finished” or “this engine does not expose relation metadata.”

## Required end cases

- Empty application, empty group, group with one connection, group with many connections.
- Mixed engines with different capabilities.
- One connection disconnected among healthy peers.
- All schemas loaded but no inferred relationships.
- Ambiguous candidates and rejected/confirmed relations.
- Very long group/connection/table names and narrow window widths.
- Keyboard-only use of group actions, connection menus, dialogs, map controls, and relationship candidate selection.
- Missing schema metadata and loading/error states.
- Group rename while group map is open.
- Connection status changes while a dialog or context menu is open.
- Screen-reader labels distinguish group map from single-connection view and explain relation provenance.

## Tests and verification

- Component tests for empty/loading/partial/error states and accessible names/roles.
- Accessibility checks using existing repository tools if configured.
- Manual keyboard-only smoke test.
- Manual responsive-width smoke test using supported desktop window sizes.
- Screenshot/visual diff review when existing tooling supports it; do not add expensive visual-test infrastructure without justification.
- Full regression run for current single-database workflows: schema, diagrams, document browsing, filtering/pagination, exports, SQL/shell views if existing, and APFS snapshot-related flows.

## Acceptance gate

- Group and connection scopes are understandable and visually distinct.
- No important status is communicated through color alone.
- Existing single-database user workflows remain functional.
- Accessibility and responsive behavior are verified to the extent supported by the repository's tooling.

---

# Phase 8 — Performance Qualification and Release Readiness

## Objective

Verify the feature under representative workloads and produce an honest release-readiness report.

## Workloads and measurement

Use deterministic fixtures for repeatability and real test databases only where safely available. Record the machine/runtime/test environment. At minimum measure:

1. A small group: 5 connections and roughly 50 tables/collections total.
2. A larger synthetic group, with the size selected based on current graph/layout limits; record exact node and edge counts.
3. A mixed-engine group including PostgreSQL, MongoDB, MySQL, and Redis metadata where fixture/adapters permit.
4. A degraded group with one slow/unreachable connection.
5. A high-ambiguity graph with repeated table/collection names and many possible candidates.

Measure separately:

- Time to first usable group UI.
- Time until all successful schemas are loaded.
- Peak active CLI schema processes.
- Relationship candidate generation duration.
- Graph layout duration.
- UI interaction responsiveness during pan/zoom/search.
- Memory/resource behavior where a reliable measurement is available.
- Cancellation/cleanup and cache behavior after switching groups or removing connections.

Use the audit's proposed **maximum of 3 concurrent schema introspections** as the initial concurrency acceptance target. Use **60 FPS on a graph with at least 50 tables** as a performance goal only if a stable reference machine/tooling is available; record the actual measured result and method. Do not claim 60 FPS if no frame-time measurement was performed. If the target is not met, profile the real bottleneck before introducing workers, virtualization, or a broader rewrite.

## Required end cases

- All database schemas load successfully.
- One adapter is significantly slower than peers.
- One connection times out.
- Repeated map open/close cycles do not produce steadily growing process counts or stale UI state.
- Repeated search/pan/zoom does not re-fetch schemas or re-run unchanged relationship calculations.
- Large candidate sets remain deterministic and ambiguous results remain visible.
- Removing a connection during a benchmark cleans up its queries/processes.
- App restart clears transient state without corrupting persisted groups or mappings.

## Tests and verification

- Run all relevant unit, component, integration, type, lint, and build checks available in the repository.
- Run Rust tests and frontend tests using the actual project scripts.
- Run end-to-end tests if the repository has an executable Tauri E2E setup.
- Run adapter integration tests only against disposable/test databases and never against production by default.
- Capture benchmark input sizes, environment, run count, results, and limitations.
- Inspect final diff for unrelated files and accidental secrets.
- Confirm persistence migration/recovery behavior with a copy of a legacy fixture, not the user's live store.

## Acceptance gate

- Every critical test is passing or explicitly marked blocked/unverified with evidence.
- Peak schema-introspection concurrency meets the configured limit.
- No known blocker remains for group isolation, relationship correctness, navigation, or credential protection.
- Performance claims have measurements attached.
- A release-readiness report gives known limitations, not just a green checklist.

---

# Cross-Phase End-to-End Scenarios

These scenarios must be covered across unit, component, integration, and manual testing as appropriate. Do not rely on one end-to-end test to replace focused tests for critical rules.

## E2E-01: Create and restore Fameo group

1. Start with an empty test store.
2. Create group `Fameo`.
3. Add multiple supported engine connections, including PostgreSQL and MongoDB.
4. Verify the group and each connection appear under the correct sidebar scope.
5. Restart/reload the app or reload the store in the test.
6. Verify all group membership and non-secret metadata persist, with no passwords in JSON.

**Expected:** The group persists and its connections remain correctly associated. Secure secrets remain in the secure store.

## E2E-02: Group isolation

1. Create groups `Fameo` and `EduSphere`.
2. Give both groups tables/collections with the same names and similarly named ID columns.
3. Open the `Fameo` map.
4. Open the `EduSphere` map.

**Expected:** Each map contains only its own connections and generates no relationship across group boundaries.

## E2E-03: Mixed-engine group

1. Create a group with PostgreSQL, MongoDB, MySQL, and Redis connections where available.
2. Load metadata and browse each connection independently.
3. Open the group map.

**Expected:** Each adapter shows only its supported metadata and operations. No engine is represented as supporting native foreign keys when it does not.

## E2E-04: Unique cross-database candidate

1. Create a source `messages.user_id` field and one plausible target `auth.users.id` field with compatible metadata.
2. Open the group map and inspect the inferred relation.
3. Open the source table detail.

**Expected:** The relation is labelled inferred/unverified; the source field and target are visible in relevant detail views. It is not mislabeled as a database-enforced FK.

## E2E-05: Ambiguous targets

1. Add two plausible `users` destinations in the same group.
2. Reload schema and relationship candidates.

**Expected:** Both candidate targets are surfaced as ambiguous with their reasons. Neither is arbitrarily chosen or silently omitted. The user can confirm one or reject the candidates.

## E2E-06: Persist confirmed mapping

1. Confirm a source-to-target mapping.
2. Reload/restart the app and schema metadata.
3. Reopen the map and source table.

**Expected:** The configured mapping remains available by stable identity, with clear configured/confirmed provenance. It is still described as an application-level mapping, not a database-enforced FK.

## E2E-07: Cross-database navigation and back

1. From the group map, open `chat.messages`.
2. Inspect the relationship to `auth.users`.
3. Navigate to the target using a safe, compatible filter where supported.
4. Return using Back or breadcrumbs.

**Expected:** The correct connection and table are opened. Back restores the source table context and relevant supported state. No filter is sent to the wrong engine or connection.

## E2E-08: Target unavailable

1. Open a source table with a valid configured target mapping.
2. Make the target unavailable in a disposable test environment or mock the adapter failure.
3. Trigger target navigation.

**Expected:** A clear, non-secret error is shown. Source context is retained; no crash or unbounded retry occurs.

## E2E-09: Delete a connection during a request

1. Start a delayed schema load for a connection.
2. Remove that connection and confirm the operation.
3. Allow the delayed request to resolve.

**Expected:** The stale response does not recreate UI entries, graph nodes, cached schema, or relation candidates for the deleted connection. Only the intended credentials/configuration are cleaned up.

## E2E-10: Legacy-store upgrade

1. Load a test copy of a legacy store without groups/mappings.
2. Open the application and organize connections into new groups.
3. Save/reload and repeat.

**Expected:** The old data loads intact, the migration is repeatable, and no secret is introduced into JSON.

## E2E-11: Failure isolation

1. Add several connections; make one unreachable and one unauthorized while others work.
2. Open the group map.

**Expected:** Healthy connections remain explorable. Failed connections show distinct safe status/error categories. A failed adapter does not fail the entire group.

## E2E-12: Performance and process cleanup

1. Open a group with 10 or more schema fixtures/connections.
2. Instrument the number of concurrent schema operations.
3. Pan, zoom, hover, search, switch groups, and close/reopen the map repeatedly.

**Expected:** Concurrency stays within the configured cap; graph interactions do not re-run expensive detection without input changes; process counts and memory do not steadily grow in the tested period.

---

# Test Matrix Required in the Final Report

For each row, report the test name/ID, level, file, command or setup, expected result, actual result, and status.

| Area             | Minimum test coverage                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Persistence      | Empty, legacy, current, round-trip, corrupted/unreadable store recovery                                                             |
| Groups           | Create, rename, delete policy, move connection, group isolation                                                                     |
| Connections      | Add, edit, remove, unique ID, secure secret preservation/cleanup                                                                    |
| Engines          | PostgreSQL, MySQL, MongoDB, Redis supported capabilities and unsupported operations                                                 |
| Relationships    | Unique match, no match, ambiguous match, type mismatch, unknown type, local/external similarity, confirmed/rejected/stale mapping   |
| Navigation       | Map → source table → target table → back; deleted/offline target; identical table names in different connections                    |
| Async state      | Stale response, cancelled request, group switch, selected connection deletion, retry/timeout                                        |
| Cache            | Invalidation after schema/group/connection/mapping changes; no cross-group reuse                                                    |
| Security         | Secret redaction, no plaintext password in store, secure-store failure, read-only operation checks                                  |
| UI/Accessibility | Empty/loading/partial/error states, keyboard access, accessible labels, focus behavior                                              |
| Performance      | Bounded concurrency, schema load latency, relation calculation, graph interaction, cleanup                                          |
| Regression       | Existing single-database diagram, schema, documents/rows, filtering/pagination, exports, SQL/shell and snapshot flows where present |

Do not mark tests passing based only on code review. If a test is added but could not be run, state `ADDED — NOT EXECUTED`.

---

# Required Commands and Verification Discipline

Discover commands from the actual repository. Do not assume that `pnpm`, a specific test runner, or a specific Cargo workspace layout is present. The verified set is listed in Section 1A. The lefthook pre-push hook runs typecheck, vitest, clippy `-D warnings` and cargo test; do not bypass it with `LEFTHOOK=0`.

At a minimum, identify and run the appropriate available equivalents of:

- Frontend unit/component tests.
- Rust unit tests.
- TypeScript typecheck.
- Lint.
- Formatting checks.
- Frontend production build.
- Rust build/check.
- Tauri integration/E2E checks, if configured.
- Targeted benchmark or performance instrumentation for the graph/concurrency changes.

Run targeted tests after each change, then the full relevant regression suite at the end. Use non-destructive fixtures and disposable databases. Never point test or migration commands at production or the user's live local store without explicit authorization.

In results, include exact commands, exit codes where available, concise output summaries, tests skipped, and why they could not run.

---

# Completion Report Format

At the end of each phase, return:

## Phase N — Result

- **Verdict:** PASS / PASS WITH LIMITATIONS / BLOCKED
- **Implemented:** concise list of verified behavior
- **Files changed:** actual repository-relative paths
- **Tests added/updated:** names and purpose
- **Verification commands:** exact commands and outcomes
- **Edge cases verified:** scenario IDs and observed results
- **Security/data migration review:** result
- **Diff review:** unrelated changes/secrets/data loss check
- **Remaining limitations:** explicit, no hand-waving
- **Next phase:** what it depends on and why it is safe to continue

At final completion, include:

1. A phase-by-phase status table.
2. Full test matrix with pass/fail/blocked/not-verified labels.
3. Exact verification commands and outcomes.
4. E2E scenario results.
5. Performance measurements and hardware/runtime context.
6. Data migration and rollback/recovery explanation.
7. Security findings and any platform-specific checks not verified.
8. Known limitations and unsupported engine capabilities.
9. Before/after readiness assessment with evidence; scores are judgments, not benchmarks.
10. Any remaining release blockers.

## Final Rule

Deliver a working, verified feature through incremental, test-gated phases. Never claim production readiness because the code was written or because compilation passed. A capability is complete only when its relevant acceptance criteria, end cases, and verification evidence are recorded.
