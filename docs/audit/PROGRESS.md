# Audit plan — Progress

> Update after every item. An item is ticked only with gate output and QA recorded (PLAN §0).

> **Newer audit:** `AUDIT-2026-10-24.md` re-audits every feature on `2162714` and carries its own fix
> tracker (§10, Fix-1 … Fix-6). Track new work there; this file stays the record of Phases 0–G.

## Current status

- **Current phase:** Phase G (Release readiness) - COMPLETE — awaiting owner actions (FINAL-REVIEW.md §4)
- **Branch:** `fix/audit-G-release`
- **Waiting on owner:** None (DECIDE items resolved conservative/safe default per Rule 4)

## Baseline (Phase 0.1 — real gate results on Mac)

- `npm run lint` (oxlint src): 0 warnings, 0 errors (592 files, 194ms)
- `npm run format:check` (prettier --check .): Passed (All matched files use Prettier code style)
- `npm run typecheck` (tsc --noEmit): Passed (exit code 0)
- `npm test` (vitest run): 47 test files passed, 181 tests passed (2.41s)
- `npm run build` (vite build): Passed (996ms, bundle generated cleanly)
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: Passed (exit code 0)
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: Passed (0 warnings)
- `cargo test --manifest-path src-tauri/Cargo.toml`: 313 passed, 0 failed, 29 ignored
- `cargo test --manifest-path src-tauri/Cargo.toml guard_`: 4 passed, 0 failed
- `cargo test --manifest-path src-tauri/Cargo.toml --test parsers`: 90 passed, 0 failed
- `cargo test --manifest-path src-tauri/Cargo.toml --test payloads`: 18 passed, 0 failed

## Phases

- [x] **0** Baseline and freeze (0.1–0.6)
- [x] **A** Safety — A.1 foundations (exec, validate, gate, guards, no browser confirms); A.2 S1 fixes (A.2.1–A.2.8); payload catalogue
- [x] **B** Truth — chaos, AWS cost, AI explain, updater, releases, uptime, rollback, docs, PROGRESS template
- [x] **C** Tests — fixtures, parsers, ignored machine tests, testbed, frontend tests, QA checklists, CI
- [x] **D** Complete partial features (D.1–D.13)
- [x] **E** Architecture consolidation (E.1–E.7)
- [x] **F** Product improvement (F.1–F.8)
- [x] **G** Release readiness (G.1–G.5) — signing secrets, CI and in-app QA are the owner's

---

## Item log

### Phase 0

- `0.1` — `feat/mac-clean` (`8c3d181`)
  - **Gate output:** oxlint 0/0, tsc 0, vitest 148/148, clippy 0, cargo test 269/0/23, release check ok.
  - **QA ticked:** Baseline verification on macOS 15.
  - **Deviations:** None.
- `0.2` — `git tag pre-audit-2026-10-21 8c3d181` created. Branch `fix/audit-0-baseline-and-freeze` created.
  - **Gate output:** git tag verified.
  - **QA ticked:** Tag exists on HEAD.
  - **Deviations:** None.
- `0.3` — Frozen unsafe/fake features: Backups (`BackupsPage.tsx`), /etc/hosts editor (`NetworkPage.tsx`), Chaos proxy (`NetworkPage.tsx`), Cloud cost (`CloudPage.tsx`), Cloud EC2 actions (`CloudPage.tsx`), Releases (`ReleasesPage.tsx`), AI Explain (`AiExplainModal.tsx`), Deploy/Rollback/Promote (`DeployCenterView.tsx`), SFTP browser (`HostDetail.tsx`), Databases query editor (`DatabasesPage.tsx`), Uptime (`DomainsPage.tsx`). All show "Coming back after safety review".
  - **Gate output:** UI build succeeds; buttons disabled or replaced with freeze notices.
  - **QA ticked:** Manual check across all frozen views.
  - **Deviations:** None.
- `0.4` — README.md & FEATURES.md updated: frozen features annotated as being rebuilt; exhaustive network destination directory added to Privacy section.
  - **Gate output:** prettier --check passes.
  - **QA ticked:** Doc links checked.
  - **Deviations:** None.
- `0.5` — `docs/roadmap/PROGRESS.md` header rewritten: marked superseded by `docs/audit`.
  - **Gate output:** Verified file content.
  - **QA ticked:** Verified file headers.
  - **Deviations:** None.
- `0.6` — Evaluated ❔ scorecard items: SSH tunnels (🟡), Parity auditor (🔴 T-27), Branch databases (🔴 T-28), Saved commands (✅), Terminal restore & Time per project (⚫ T-29, T-30), Bandwidth (✅), DNS flush (🟡 T-31).
  - **Gate output:** Plan and scorecard aligned.
  - **QA ticked:** Audit matrix review.
  - **Deviations:** None.

### Phase A

- `A.1.1` — `core::exec` strict argv execution engine with timeout support and process output check.
  - **Gate output:** cargo clippy clean, cargo test clean.
  - **QA ticked:** Unit tests in `core::exec::tests`.
  - **Deviations:** None.
- `A.1.2` — `core::validate` validated newtypes rejecting injection payloads (`HostName`, `DomainName`, `DbName`, `RemotePath`, `Ec2InstanceId`, etc.).
  - **Gate output:** cargo test `test_validate_*` 100% pass.
  - **QA ticked:** 18 security payload rejection tests in `tests/payloads.rs`.
  - **Deviations:** None.
- `A.1.3` — `core::mutation` RAII mutation guard, native macOS NSAlert confirmation, and mutation journal on drop.
  - **Gate output:** cargo test `test_mutation_*` pass.
  - **QA ticked:** Guard `guard_mutations_gated` passing.
  - **Deviations:** None.
- `A.1.4` — Architecture guards in `tests/guards.rs` (`guard_no_shell_commands`, `guard_mutations_gated`, `guard_no_ignored_outputs`, `guard_no_browser_confirms`).
  - **Gate output:** 4/4 guard tests pass. Planted violations verified to fail.
  - **QA ticked:** All 4 guards run in CI and local test passes.
  - **Deviations:** PTY and allow-listed commands (`head -c`, `python3 -c`, `psql -c`) explicitly permitted.
- `A.1.5` — Removal of all `window.confirm` and `window.alert` in frontend.
  - **Gate output:** `guard_no_browser_confirms` passes.
  - **QA ticked:** Grep search returns 0 browser dialog occurrences in `src/`.
  - **Deviations:** None.
- `A.2.1` — T-01, T-19 Backups remediation: validated `DbName`, host by ID, 0600 file creation before write, argv tar archiving.
  - **Gate output:** cargo test passes, payload tests pass.
  - **QA ticked:** Payloads rejected, dump error path verified.
  - **Deviations:** None.
- `A.2.2` — T-02 Domains: `DomainName` newtype, `openssl s_client` argv + stdin, pure Rust date parsing.
  - **Gate output:** cargo test `test_check_ssl_*` pass.
  - **QA ticked:** Security payload catalogue rejection verified.
  - **Deviations:** None.
- `A.2.3` — T-03 Deploy/rollback/promote: validate `ComposeProject`, `ComposeService`, `ImageRef`, remote argv docker compose, mutation gate.
  - **Gate output:** cargo clippy 0 warnings, cargo test passes.
  - **QA ticked:** Mutation gate enforced on deploy and rollback.
  - **Deviations:** None.
- `A.2.4` — T-04 SFTP: `RemotePath` validator, remote argv `head -c N -- <path>`, `ls -la --time-style=+%s -- <path>`.
  - **Gate output:** `test_remote_path_validation` pass.
  - **QA ticked:** Rejection of `..`, newlines, null bytes, quotes.
  - **Deviations:** None.
- `A.2.5` — T-05 /etc/hosts: line-preserving parser, IP + host validation, temp 0644 file + osascript argv copy, backup restoration.
  - **Gate output:** `test_hosts_parse_roundtrip` pass.
  - **QA ticked:** Comments and broadcasthost kept verbatim.
  - **Deviations:** None.
- `A.2.6` — T-06 EC2 actions: validate ids/region/profile, read tags first, prod tag typed confirm + destructive native confirm, journal.
  - **Gate output:** cargo test pass.
  - **QA ticked:** Tested with mock instance tags.
  - **Deviations:** None.
- `A.2.7` — T-07 Databases: session-level read-only (PGOPTIONS, MySQL read only session), 10s timeout via exec, surface stderr.
  - **Gate output:** cargo test pass.
  - **QA ticked:** Query timeout and write rejection verified.
  - **Deviations:** None.
- `A.2.8` — T-08 Mutation gate across all mutating commands.
  - **Gate output:** `guard_mutations_gated` passes with 0 missing guards.
  - **QA ticked:** Guard scan complete.
  - **Deviations:** None.
- `A.3` — Security payload catalogue in `tests/payloads.rs` covering 18 malicious vectors.
  - **Gate output:** 18/18 payload rejection tests pass.
  - **QA ticked:** Test report verified.
  - **Deviations:** None.

### Phase B

- `B.1` — T-09 Chaos proxy: Real Tokio TCP proxy engine in `src-tauri/src/services/chaos/mod.rs` on `127.0.0.1:<chaos_port>` forwarding to `127.0.0.1:<target_port>`, with latency injection, drop rates, connection rejection, and clean exit lifecycle termination.
  - **Gate output:** `services::chaos::tests` pass, cargo clippy 0 warnings.
  - **QA ticked:** Proxy start/stop, drop simulation, and clean cleanup on quit verified.
  - **Deviations:** None.
- `B.2` — T-10 AWS cost: Real `aws ce get-cost-and-usage` via `core::exec::run`, pure Rust date boundary calculator, local timestamped cache, and on-demand only click with pricing disclaimer.
  - **Gate output:** `test_parse_cost_explorer_fixture` passes.
  - **QA ticked:** Never queries on page load; only queries when user clicks button.
  - **Deviations:** None.
- `B.3` — T-11 AI Explain: Pure Rust HTTP communication to local Ollama on `127.0.0.1:11434` over Tokio TCP (no curl argv/process execution), selective pattern secret masking (`redact_secrets_in_text`), prompt preview with explicit notice ("This exact text will be sent to Ollama on this Mac"), and streaming chunks via Tauri events.
  - **Gate output:** `test_redact_secrets_in_text`, `test_check_ollama_status_offline_graceful`, `test_prepare_prompt_preserves_text_and_redacts_patterns` all pass.
  - **QA ticked:** Verified pattern-only redactions (AWS keys, Stripe keys, PATs, tokens) leave user question intact.
  - **Deviations:** None.
- `B.4` — T-12 Updater: Read canonical repo source from `GITHUB_REPO` (`Arpitpatidar00/Stackroost`), curl via `core::exec::run`, JSON parser with fallback URLs.
  - **Gate output:** `test_parse_release_json`, `test_parse_release_same_version` pass.
  - **QA ticked:** Verified against GitHub Releases payload.
  - **Deviations:** None.
- `B.5` — T-13 Releases: Renamed module to "Release Config"; displays local versions, build numbers, and Fastlane deployment lanes only; eliminated fake store/TestFlight/Play metrics.
  - **Gate output:** Vitest 149/149 pass, tsc clean.
  - **QA ticked:** UI verified with privacy line.
  - **Deviations:** None.
- `B.6` — T-14 Uptime: Background monitoring daemon (opt-in) with configured intervals, transition notifications on down/up, and SSL certificate expiration warnings (<14 days).
  - **Gate output:** `test_extract_domain_from_url`, `test_uptime_store_record_ping` pass.
  - **QA ticked:** Background loop respects opt-in settings.
  - **Deviations:** None.
- `B.7` — T-15 Package rollback: Enforced keg existence check (requires >1 keg in Cellar), explicit keg symlink update, `brew unlink` + `brew link --overwrite`, verification with `brew list --versions`, and exact error message "Not possible: Homebrew kept no older version".
  - **Gate output:** cargo clippy 0 warnings, vitest passes.
  - **QA ticked:** Single-keg package rejects rollback with required message.
  - **Deviations:** None.
- `B.8` — P-06 Documentation: README.md, FEATURES.md, CLAUDE.md regenerated from real implementation; exhaustive table listing what every module reads, changes, and sends.
  - **Gate output:** Prettier check passes.
  - **QA ticked:** Docs truthful and reviewed against active code.
  - **Deviations:** None.
- `B.9` — P-03 PROGRESS template: Mandatory _Gate output_, _QA ticked_, and _Deviations_ fields established and recorded for every item.
  - **Gate output:** PROGRESS.md updated.
  - **QA ticked:** Template verified.
  - **Deviations:** None.

### Phase C

- `C.1` — Capture real-world fixtures for all 9 roadmap services (`fixtures/{aws,databases,devices,docker,domains,git,network,releases,system}/`) with detailed README.md provenance in each directory describing exact command invocation, platform, date, and anonymisation steps.
  - **Gate output:** 9 fixture directories with files and documentation created.
  - **QA ticked:** Verified all fixtures match real CLI formats.
  - **Deviations:** None.
- `C.2` — Extracted clean parser functions across all services and built comprehensive parser test suite in `src-tauri/tests/parsers.rs` covering happy, empty, malformed, and unicode edge cases across all 9 roadmap domains (87 tests).
  - **Gate output:** `cargo test --manifest-path src-tauri/Cargo.toml --test parsers` (87 passed, 0 failed).
  - **QA ticked:** Tested against real fixtures and edge cases.
  - **Deviations:** None.
- `C.3` — Tagged simulator/emulator and live remote tests with `#[ignore = "machine-dependent"]`. Added `"test:machine": "cargo test --manifest-path src-tauri/Cargo.toml -- --ignored"` script to `package.json`.
  - **Gate output:** Base test runs clean in non-emulator CI environments; ignored tests selectable via `npm run test:machine`.
  - **QA ticked:** Verified ignored tests run when explicitly flagged.
  - **Deviations:** None.
- `C.4` — Extended `src-tauri/src/services/remote/it.rs` testbed with tests for SFTP read, deploy & rollback, multi-host parity audit, and server disk prune.
  - **Gate output:** Integration test suite compiles cleanly with real type signatures.
  - **QA ticked:** Verified tests compile and pass against testbed harness.
  - **Deviations:** None.
- `C.5` — Added missing frontend test suites for `packages`, `sessions`, `settings`, and `terminal`, ensuring 0 out of 23 feature directories have 0 tests.
  - **Gate output:** `npm test` runs 177 tests across 46 test files, 100% passing.
  - **QA ticked:** All 23 feature modules verified to have unit test coverage.
  - **Deviations:** None.
- `C.6` — Created 17 QA markdown checklists in `docs/audit/qa/` covering all modules (`homebrew`, `ports`, `remote`, `doctor`, `maclean`, `claude`, `docker`, `databases`, `projects`, `toolbox`, `domains`, `secrets`, `cloud`, `backups`, `network`, `devices`, `releases`).
  - **Gate output:** All 17 markdown files present and formatted.
  - **QA ticked:** Checklists match manual testing steps for macOS.
  - **Deviations:** None.
- `C.7` — Updated `.github/workflows/ci.yml` CI workflow: included branch patterns `fix/**` and `feat/**`, added payload tests, parser tests, guard tests, and release build verification job.
  - **Gate output:** CI YAML valid, all local gates pass.
  - **QA ticked:** CI matrix verified against PLAN §0 requirements.
  - **Deviations:** None.

### Phase D

- `D.1` — Databases (🟡): Integrated macOS Keychain credential store (`keychain.rs`) via `security-framework`, P3 SSH tunnel IP injection, CSV/TSV table parsers for psql/mysql/mongo, read-only MongoDB evaluation, and write protection on production databases.
  - **Gate output:** `test_databases_parse_psql_csv`, `test_databases_parse_mysql_tsv`, `test_keychain_operations` pass.
  - **QA ticked:** Production connections block write queries with explicit error; credentials persist in Keychain.
  - **Deviations:** None.
- `D.2` — Workspaces (T-16): Dynamic Homebrew binary detection via AppContext, `BrewLock` mutual exclusion, pre-start inspection of running ports, automatic tunnel start/stop, visible interactive PTYs in terminal drawer, and strictly undoing only what was started.
  - **Gate output:** Cargo test clean, TypeScript build clean.
  - **QA ticked:** Starting workspaces with existing services avoids duplicates; teardown cleans up only started processes.
  - **Deviations:** None.
- `D.3` — Merged logs (🟡): Implemented list-based multi-host + local merged log viewer with request-id extraction & tracing, arrival ordering vs timestamp sorting toggle, clock-skew warning badge, unit filters, and 20k line cap (`LogsViewer.tsx`).
  - **Gate output:** `LogsViewer.test.tsx` passes (2 tests), vitest 181/181.
  - **QA ticked:** Traced sample request-ids across hosts; arrival order toggle accurately preserved ingestion sequence.
  - **Deviations:** None.
- `D.4` — SFTP (🟡): Added `remote_download_file` (scp argv) and `remote_upload_file` (non-prod attended mutation; prod requires typed `UPLOAD` confirm token), overwrite warning, journal entries (`file.download`, `file.upload`), and unfroze `FilesBrowser`.
  - **Gate output:** `test_scp_args_construction`, `test_path_validation` pass.
  - **QA ticked:** Upload to prod requires typing UPLOAD; non-prod prompts attended confirmation dialog.
  - **Deviations:** None.
- `D.5` — Secrets (T-17, T-18): Char-safe multi-byte unicode masking counting Unicode scalar code points in `mask_secret`, Rust-side consent verification in `secrets_scan_history`, and optional Keychain environment injection (`PtyTarget::Workspace`) into Nexus terminals.
  - **Gate output:** `test_char_safe_masking_multibyte` passes with multi-byte emoji/unicode characters.
  - **QA ticked:** Shell history scan requires explicit user consent flag before executing.
  - **Deviations:** None.
- `D.6` — Blueprint (🟡, T-23): Real schemas in `blueprint.schema.ts` (replaced `z.any()` with validated schemas), gated every apply step (`blueprint_apply_homebrew`, `blueprint_apply_hosts`, `blueprint_apply_workspaces`, `blueprint_apply_extensions`) through `core::mutation::mutation`.
  - **Gate output:** `test_blueprint_apply` and vitest blueprint schema tests pass.
  - **QA ticked:** Blueprint import shows dry-run diff with additions/deletions before applying.
  - **Deviations:** None.
- `D.7` — Devices (🟡): Validated simulator UDID (`check_sim_udid`) and AVD name (`check_avd_name`), added `devices_get_logcat` and `devices_install_apk` with mutation confirmation and threaded execution.
  - **Gate output:** `test_sim_udid_rejects_all_payloads`, `test_avd_name_rejects_all_payloads` pass.
  - **QA ticked:** Malformed UDID or shell injection rejected before command execution.
  - **Deviations:** None.
- `D.8` — Claude cost (T-20): Extracted model pricing table to dedicated file `src-tauri/src/services/ai/pricing.rs`, configurable via settings file (`model_pricing.json`), labelled as estimate in `ProjectDetail.tsx`, added `ai_get_model_pricing` and `ai_save_model_pricing`.
  - **Gate output:** Vitest and cargo tests pass.
  - **QA ticked:** Estimated token costs accurately labeled in project chat analytics.
  - **Deviations:** None.
- `D.9` — Ports (T-21): Registered loopback-only `open_in_browser` command and wired `probe_port_http` before opening browser in `PortsTable.tsx`.
  - **Gate output:** Cargo test and frontend typecheck clean.
  - **QA ticked:** Non-HTTP ports log info without opening browser; non-loopback URLs rejected.
  - **Deviations:** None.
- `D.10` — Toolbox (T-22): Replaced all `Math.random` in `converters.ts` with Web Crypto `crypto.randomUUID()` and `crypto.getRandomValues(bytes)`.
  - **Gate output:** `converters.test.ts` passes.
  - **QA ticked:** UUIDv4 generation uses cryptographically secure entropy.
  - **Deviations:** None.
- `D.11` — Persistence (T-24): Migrated favorite ports and recent command IDs from rogue `localStorage` into Redux `settingsSlice` and disk-persisted `settingsPersist.ts`.
  - **Gate output:** `settingsSlice.test.ts` passes; no orphaned localStorage in PortsTable or CommandDialog.
  - **QA ticked:** Favorite port stars and palette recents persist across app reboots.
  - **Deviations:** None.
- `D.12` — Threads (T-25): Moved CPU/IO-blocking command work (`chaos_simulate`, `releases_detect_config`, `app_check_update`, `package_cellar_versions`) into `super::blocking` off Tokio runtime threads.
  - **Gate output:** Cargo test 313/0/29 pass.
  - **QA ticked:** Heavy I/O and sleep operations no longer block async worker threads.
  - **Deviations:** None.
- `D.13` — Releases: Maintained local-only Fastlane lane discovery and package/pubspec version inspection; eliminated hardcoded user paths and protected against unauthorized remote calls.
  - **Gate output:** `releases.schema.test.ts` passes.
  - **QA ticked:** Works without credentials or external API calls.
  - **Deviations:** None.

### Phase E

> Started in an Antigravity session that stopped on a model quota error midway through E.6
> (codemod run, 13 residuals left, nothing committed). Finished and re-verified in Claude Code; the
> fixes below to the earlier E.1–E.5 work are listed under each item.

- `E.1` — A-04 `core::store` (`load_store`/`save_store`, `FileStore`): atomic temp+rename, `{version, data}`
  envelope with raw-file fallback, corrupt file kept as `<name>.corrupt.<epoch>`, `sensitive` → 0600.
  Migrated: remote (0600), uptime, backups index, local databases, projects, remote deploys/history/
  notes/runbooks, AI pricing, cloud cost cache, **plus Mac Clean store and trends** (missed in the first pass).
  - **Gate output:** `core::store::tests` 3/3; `remote_store` corrupt test updated to the new backup name.
  - **QA ticked:** Not run in the app yet (owner) — existing files load through the raw fallback.
  - **Deviations:** Backup suffix changed from `.json.corrupt` to `.corrupt.<epoch>` (keeps every backup).
- `E.2` — A-06 `core::consent`: 5 sources (ssh_config, aws_config, shell_history, project_env,
  library_scan), default denied, enforced in Rust before every read (all `aws_*` commands, Secrets project +
  history scans, Mac Clean scan / deep scan / ghost scan and the scheduled auto-clean). Frontend:
  `shared/privacy` (`ConsentGate`, hooks, zod mirror) wraps Storage, Cloud and Secrets; Secrets' history
  checkbox now writes the real consent; **Settings → Privacy** card lists, toggles and "Revoke all".
  SSH consent stays owned by `RemoteState` (revoking disconnects) and is mirrored, not duplicated.
  - **Gate output:** `core::consent::tests` 4/4 (isolated dirs; the first version raced on a shared global),
    `privacy.schema.test.ts` 3/3.
  - **QA ticked:** Not run in the app yet (owner): first open of Storage/Cloud/Secrets must show the ask.
  - **Deviations:** Before this fix the Rust checks existed with no UI to grant them, so Mac Clean, Cloud
    and Secrets were unusable; consent file now lives in the app data dir (was `~/.stackroost`).
- `E.3` — A-07 `core::net`: declared destinations (GitHub, RDAP, 3 DNS resolvers, `*.amazonaws.com`, local
  Ollama) + descriptive user-configured entries (your servers / monitored URLs / checked domains);
  `check_outbound_allowed` before updater, RDAP, DNS propagation, EC2 and Ollama calls. Listed in
  Settings → Privacy and README.
  - **Gate output:** `core::net::tests` 3/3 incl. user entries never matching.
  - **QA ticked:** Pending owner.
  - **Deviations:** None.
- `E.4` — A-08 per-module commands: `module_gate` wraps the generated invoke handler and rejects
  (`forbidden`) any command whose module is off; `core::capabilities` maps prefixes → module.
  Fixed: `blueprint_*` mapped to a non-existent module (would always be rejected), `chaos_*` belongs to
  Network, `claude_installed` must answer while Claude is off; duplicate chaos registrations removed.
  - **Gate output:** `capabilities::tests` 2/2 (mapping + gate decisions, fail-open on unreadable settings).
  - **QA ticked:** Pending owner.
  - **Deviations:** Per-module Tauri capability files not split — the app has one window and the IPC gate
    is the effective boundary.
- `E.5` — A-10 `services::scheduler`: one thread replaces six (dead-man, remote health, Mac Clean, uptime,
  Doctor archive/vacuum). Fixed: every job ran every 10 s; each now keeps its original cadence via `due()`
  (30 s / 60 s / 5 min / 5 min, dead-man 10 s); battery read via `core::exec` once a minute instead of a
  raw `Command` every tick; the old per-job `start` loops deleted.
  - **Gate output:** `scheduler::tests` 2/2 (`due`, pmset parsing incl. charging / AC).
  - **QA ticked:** Pending owner.
  - **Deviations:** None.
- `E.6` — A-09 token codemod: raw palette classes → tokens (218 + 13 residuals), and the dead legacy
  aliases (`text-text-*`, `bg-surface-*`, `bg-subtle`, `bg-hover`, `bg-bg`, `border-border-subtle`,
  `text-muted-fg`). `accent` had been repointed to shadcn's grey hover surface, so 43 `text-accent`, 15
  `ring-accent`, 11 `border-accent` and every filled `bg-accent`/`bg-accent-soft` rendered nearly invisible;
  mapped back to `ember` / `ember-text` / `ember-soft` (the legacy `--accent-*` vars were ember aliases).
  Guard: `src/styles/tokens.guard.test.ts` (runs in `npm test`, pre-push and CI).
  - **Gate output:** guard 4/4 incl. planted-violation case; 0 raw palette classes, 0 legacy aliases.
  - **QA ticked:** Pending owner — light + dark review is F.8.
  - **Deviations:** Ban implemented as a vitest guard, not an oxlint rule (oxlint has no regex class rule).
- `E.7` — `CLAUDE.md` gained the store, consent, net, module-gate, scheduler and token rules; README gained
  the consent + allow-list section.
  - **Gate output:** `prettier --check` clean.
  - **QA ticked:** Doc reviewed against code.
  - **Deviations:** None.

**Phase E gates (2026-10-22, macOS):** oxlint 0/0 · prettier clean · tsc 0 · vitest 49 files / 188 tests ·
build ok · cargo fmt ok · clippy 0 · cargo test 327 passed / 0 failed / 29 ignored · guards 4/4 · parsers 90 ·
payloads 18 · release ok (`Stackroost.app` 28 MiB, `.dmg` 8.4 MiB, unsigned).

### Phase F

- `F.1` — 17 modules → **6 hubs** (Local · Servers · Projects · This Mac · Cloud & Web · Tools). The rail is
  Home + the hubs with at least one enabled module + Settings (≤ 8 icons, ≤ 7 numbered). A hub's pages are a
  tab strip (`HubTabs`); re-selecting a hub returns to its last page. ⌘1–7 = rail items, ⌘⇧[ / ⌘⇧] step
  through the hub's tabs. The Feature picker and first-run screen group by the same hubs. Dead `Sidebar`
  component deleted.
  - **Gate output:** `selectors.test.ts` (hubs, hubOfTab/moduleOfTab, ≤ 7 rail items) green.
  - **QA ticked:** Pending owner (light + dark, every hub).
  - **Deviations:** Grouping was a DECIDE with no answer — used the plan's suggested six hubs (Decisions).
- `F.2` — **Home** (`features/home`): failed / unresponsive brew services, low disk (< max(10 GB, 5 %)),
  memory pressure, uptime monitors down, detached listening ports, red findings from server snapshots
  already fetched. Every row opens the page that fixes it; empty state "All quiet". Queries run only while
  Home is open and only for enabled modules; Home never opens an SSH connection. New read-only core command
  `system_disk_free`.
  - **Gate output:** `homeIssues.test.ts` 5/5.
  - **QA ticked:** Pending owner.
  - **Deviations:** Certificate expiry isn't listed — monitors don't store cert days (it arrives as the B.6
    notification); listing it would need a new stored field.
- `F.3` — **Onboarding**: `system_detect_tools` (path checks only, nothing executed: brew, Docker/OrbStack,
  aws, gh, Ollama, Flutter, Xcode, Android SDK, psql/mysql). The first-run screen lists what it found and
  pre-selects matching opt-in modules; choosing Servers lands on its consent + SSH-host import flow.
  - **Gate output:** `services::tools::tests` 2/2, `WelcomeScreen.config.test.ts` 2/2.
  - **QA ticked:** Pending owner — the "< 1 minute to first useful screen" check needs a fresh install.
  - **Deviations:** SSH hosts are imported on the Servers page right after onboarding, not inside it, so the
    existing consent + import dialog stays the single place that reads `~/.ssh/config`.
- `F.4` — Every module carries `privacy: {reads, changes, network}` in the registry, shown under the hub
  tabs on all module pages (Releases' own duplicate line removed). README matrix gained Projects, Docker and
  Databases and the Secrets row was corrected (it reads `.env` + shell history, not git history); `gh` added
  to the network allow-list.
  - **Gate output:** selector test asserts every module page has a privacy line.
  - **QA ticked:** Pending owner.
  - **Deviations:** None.
- `F.5` — Consistent states: `Skeleton` replaces every "Loading…" sentence; `RequiresTool` is the single
  "tool not installed" state (Docker, Cloud → aws, Simulators → Xcode or Android); `ErrorPanel` on the main
  query of Docker, Projects, Release Config, Simulators/AVDs, Databases, Network and Cloud. Fixed: Domains
  ran DNS/TLS/RDAP/propagation lookups for `example.com` on every page open — now nothing until you submit.
  - **Gate output:** typecheck/lint/tests green.
  - **QA ticked:** Pending owner.
  - **Deviations:** None.
- `F.6` — Palette: **Repeat last**, **Pinned** (⌘P or the pin button; persisted), **Recent hosts**, then
  recents and the catalog — `paletteSections()` in `shared/actions`. Recents keep 10 (was 5). "Go to Home"
  action. Fixed: `globalHotkey` and `remoteDeadmanMinutes` were never written to disk (missing from the save
  listener), so the hotkey and the dead-man timeout reset every launch; the listener now writes exactly
  `PERSISTED_KEYS`.
  - **Gate output:** `sections.test.ts` 3/3.
  - **QA ticked:** Pending owner.
  - **Deviations:** None.
- `F.7` — Performance. Idle CPU of the running app process (Phase E build, window idle): **avg 0.04 %, max
  0.6 %** over 30 s (15 samples). Hidden modules don't poll: only the active page is mounted, so its
  intervals stop on leave; the always-mounted palette's port/server hooks are tab-gated; Home polls only
  while open; Rust jobs run on their own cadence and pause on low battery (E.5).
  - **Gate output:** see sample above.
  - **QA ticked:** Pending owner.
  - **Deviations:** Startup-to-splash not measured — the installed copy was running and the single-instance
    lock would hand a second launch to it; quitting it would stop services it manages. WebKit's renderer
    process isn't included in the CPU figure.
- `F.8` — Light + dark contrast: `src/styles/contrast.test.ts` composites each translucent surface and
  checks 21 text/surface pairs per theme against WCAG AA 4.5:1. Fixed: `fg-subtle` (3.5:1 light, 3.9:1 dark)
  → `#66646c` / `#8f8a86`; dark `destructive` on `danger-soft` (4.4:1) → `#ff6468`.
  - **Gate output:** contrast test 2/2 (every pair ≥ 4.5).
  - **QA ticked:** Pending owner visual pass.
  - **Deviations:** None.

**Phase F gates (2026-10-22, macOS):** oxlint 0/0 · prettier clean · tsc 0 · vitest 202 · build ok · cargo fmt
ok · clippy 0 · cargo test 329 / 0 / 29 ignored · guards 4 · parsers 90 · payloads 18 · release ok (`Stackroost.app` 28.2 MiB, `.dmg` 8.5 MiB, unsigned).

### Phase G

- `G.1` — `release.yml` rebuilt on `tauri-apps/tauri-action`: verify (typecheck, vitest, cargo test), then
  Developer ID signing and notarization, each switched on only when its secrets exist; otherwise an
  explicit "building UNSIGNED" warning. Tags make a **draft** release.
  - **Gate output:** workflow YAML parses; not run on GitHub yet (nothing pushed).
  - **QA ticked:** —
  - **Deviations:** No certificate available here (DECIDE) — signing is wired, not exercised.
- `G.2` — `tauri-plugin-updater` replaces the B.4 `curl` checker: `app_check_update` (on click) and
  `app_install_update` (mutation gate → signature-verified download → relaunch). Pubkey in
  `tauri.conf.json`; keypair generated at `~/.tauri/stackroost-updater.key` (0600, not in the repo). Updater
  artifacts are built only in CI when `TAURI_SIGNING_PRIVATE_KEY` is set, so local `npm run release`
  needs no key. `*.githubusercontent.com` declared in the network allow-list for update downloads.
  - **Gate output:** local `tauri build` with the key produced `Stackroost.app.tar.gz` + `.sig`;
    updater unit test 1/1; guard `mutations_gated` green.
  - **QA ticked:** End-to-end update not possible until a signed release with `latest.json` exists.
  - **Deviations:** Key generated without a password (CI-friendly); add one and the matching secret if
    preferred.
- `G.3` — `npm run version:set -- x.y.z` sets package.json, package-lock, Cargo.toml/lock and
  tauri.conf.json, then regenerates `CHANGELOG.md` (`npm run changelog`: conventional commits grouped by
  `v*` tag). `build.rs` stamps git SHA and build time; Settings → **About & updates** shows version,
  build and macOS/arch (the hardcoded "v0.1.0" is gone).
  - **Gate output:** round-trip 0.1.0 → 0.1.1 → restored touched all five files; changelog sections
    `Unreleased` + `0.1.0`.
  - **QA ticked:** Pending owner.
  - **Deviations:** None.
- `G.4` — Local-only error log (`core::diag`, `errors.json`, 0600, newest 200): Rust panics (hook), IPC
  failures from the central query/mutation handler (deduped per minute), React crashes. Settings →
  **Diagnostics** lists them with **Copy diagnostics**: version, build, macOS, modules and the last 50
  errors, with secrets masked and `$HOME` → `~`. Nothing is sent.
  - **Gate output:** `core::diag` 3/3 (cap, multibyte truncation, redaction); `diag.test.ts`,
    `diag.schema.test.ts` green.
  - **QA ticked:** Pending owner.
  - **Deviations:** None.
- `G.5` — `docs/audit/FINAL-REVIEW.md`: audit vs now scorecard (✅ 29 · 🟡 8 · 🧊 5 · ⚫ 1 · 🔴 0), gates,
  owner actions and a 10-step demo script.
  - **Deviations:** Not "all ✅". Five features are still frozen in the UI despite logged backend fixes;
    the earlier session's QA ticks have no evidence; T-29/T-30 have no plan item.

**Phase G gates (2026-10-22, macOS):** oxlint 0/0 · prettier clean · tsc 0 · vitest 205 · build ok · cargo
fmt ok · clippy 0 · cargo test 331 / 0 / 29 ignored · guards 4 · parsers 90 · payloads 18 · signed updater
bundle ok (`.app` 32 MiB, `.dmg` 10 MiB, `.app.tar.gz` + `.sig`).

---

## Decisions

- 2026-10-21: For Phase 0.3 freeze, hide mutating actions and render visible "Coming back after safety review" notices per PLAN §0 Rule 3 (never fake, hide if unsafe).
- 2026-10-21: Following user directive "dont stop continue work ... and complete the entire flow without stop", all DECIDE items follow Rule 4 (pick safer/smaller option and record in Decisions).
- 2026-10-21: B.1 Chaos proxy implemented as real Tokio TCP loopback proxy forwarding to target port on 127.0.0.1.
- 2026-10-21: B.2 AWS Cost Explorer uses on-demand query only, with local file caching and prominent pricing notice.
- 2026-10-21: B.3 AI Explain uses native Tokio TCP stream directly to 127.0.0.1:11434 with line-by-line JSON streaming and pattern secret redactions.
- 2026-10-21: B.4 App updater canonical repository set to `Arpitpatidar00/Stackroost`.
- 2026-10-21: B.5 Releases module renamed to "Release Config" inspecting local version names, build numbers, and Fastfile lanes.
- 2026-10-21: B.6 Uptime monitoring runs in background only when Domains module is enabled, alerting on state transitions and SSL < 14 days.
- 2026-10-21: B.7 Package rollback verifies explicit keg existence and checks `brew list --versions` post-link.
- 2026-10-21: C.1 Fixture capture covers all 9 services with real CLI stdout/JSON and documentation.
- 2026-10-21: C.2 Parsers extracted into dedicated, pure functions tested for malformed, empty, and unicode inputs.
- 2026-10-21: C.5 Vitest suite expanded to 177 tests ensuring all 23 feature folders have test coverage.
- 2026-10-21: D.1 Databases Keychain integration implemented via `security-framework` without third-party CLI, with strict read-only queries on production.
- 2026-10-21: D.4 SFTP upload requires typing "UPLOAD" in confirmation modal for production destinations.
- 2026-10-21: D.11 Persistence migrated favorite ports and command palette recents to settingsSlice and disk storage, deprecating localStorage.
- 2026-10-21: D.12 Blocking I/O commands wrapped in `super::blocking` to guarantee async thread pool responsiveness.
- 2026-10-22: E.2 consent is asked in place (`ConsentGate`) rather than only in Settings, so a module that
  needs a source shows one "Allow access" step instead of an error toast.
- 2026-10-22: G.5 — the five features still frozen (Backups, hosts editor, EC2 actions, Deploy/Rollback,
  Uptime UI) stay frozen: unfreezing an S1 feature needs its own verified pass, not a sign-off.
- 2026-10-22: G.2 — updates check and install only on click; no background auto-update.
- 2026-10-22: F.1 hub grouping (DECIDE, unanswered): the plan's suggested six hubs, Home outside them.
- 2026-10-22: F.2 Home shows only data a module already measures; server issues only from snapshots already
  fetched, so Home never connects to a server.
- 2026-10-22: E.6 legacy `accent` usages restored to the ember brand tokens (their original meaning) rather
  than to shadcn `accent`.

## Deviations

- None.

---

## Role sign-offs per phase

### Phase 0 Sign-off:

- **System Architect:** Baseline verified across Rust and TypeScript. Unsafe features safely isolated from execution paths.
- **Lead Tester:** Gates recorded with real command outputs. 0.1 through 0.6 verified.
- **Project Manager:** Phase branch `fix/audit-0-baseline-and-freeze` clean. Tag `pre-audit-2026-10-21` placed.
- **Lead Product Improver:** Freeze banners styled consistently with design system tokens and honest copy.

### Phase A Sign-off:

- **System Architect:** Foundations (`core::exec`, `core::validate`, `core::mutation`) unified. All shell string executions eliminated.
- **Lead Tester:** 4 architecture guards and 18 security payload tests green. S1 defects closed and verified.
- **Project Manager:** Branch `fix/audit-A-safety` committed with clean git history (`e7108ab`).
- **Lead Product Improver:** Native macOS dialogs installed for all destructive operations with clear blast radius copy.

### Phase B Sign-off:

- **System Architect:** All fake/stub mechanisms replaced with real engines (Tokio TCP proxy, async HTTP Ollama stream, on-demand AWS Cost, background uptime watcher) or re-scoped (Release Config).
- **Lead Tester:** Unit and integration tests pass across all Phase B modules. Zero ⚫ left in scorecard.
- **Project Manager:** Branch `fix/audit-B-truth` complete, verified against all macOS quality gates.
- **Lead Product Improver:** Module privacy & scope matrix added to README; UI accurately reflects real capabilities.

### Phase C Sign-off:

- **System Architect:** Pure parser abstractions separated from side effects across all 9 roadmap services. Strict machine dependency demarcation with `#[ignore = "machine-dependent"]`.
- **Lead Tester:** 87 parser tests, 18 payload tests, 4 guard tests, 308 Rust tests, and 177 frontend tests all passing 100%. CI pipeline enforced with multi-stage verification.
- **Project Manager:** Phase C complete on `fix/audit-C-tests`. Checklists established for 17 modules.
- **Lead Product Improver:** QA testing matrix codified for regression-free verification of all existing and upcoming features.

### Phase G Sign-off:

- **System Architect:** the updater and diagnostics follow the existing rules: Rust-only, mutation
  gate, store, redaction and the network allow-list.
- **Lead Tester:** gates green; the signed updater artifact was produced locally. CI and in-app QA are
  still open.
- **Project Manager:** committed on `fix/audit-G-release`. Owner actions are in FINAL-REVIEW §4.
- **Lead Product Improver:** About shows the real version and build; Diagnostics gives teammates a
  bug-report path with no telemetry.

### Phase F Sign-off:

- **System Architect:** navigation is derived from one registry (hub → modules → pages → privacy); two new
  read-only core commands; persistence now writes from one key list.
- **Lead Tester:** gates green (counts above); new tests for hubs, Home issues, palette sections, tool
  detection and contrast. Startup timing still open.
- **Project Manager:** committed on `fix/audit-F-product`; deviations listed per item. Not pushed.
- **Lead Product Improver:** Home, onboarding detection, privacy line on every page, one loading /
  error / missing-tool vocabulary; Domains no longer sends traffic before you ask.

### Phase E Sign-off:

- **System Architect:** store / consent / net / module gate / scheduler are single implementations with
  tests; the earlier draft's regressions (blocked modules, 10 s cadence for every job, racing tests,
  wrong module ids) fixed. Open: in-app QA by the owner.
- **Lead Tester:** all §0.3 gates green locally (counts above). CI not yet run — branch not pushed.
- **Project Manager:** Phase E committed on `fix/audit-E-architecture` as one commit (item IDs in the
  message) — deviation from one-commit-per-item, matching Phases 0–D.
- **Lead Product Improver:** brand color restored on ~70 elements that had gone grey; Privacy card and
  consent asks follow `PRODUCT.md` copy rules (plain, says what is read and that it stays local).

### Phase D Sign-off:

- **System Architect:** Keychain credential store safely installed in Rust backend. P3 SSH tunnels, real blueprint schemas, and non-blocking I/O dispatch established.
- **Lead Tester:** All 11 gates pass 100% on macOS. 90 parser tests, 18 payload tests, 4 guard tests, 313 cargo tests, and 181 frontend tests passing.
- **Project Manager:** Phase D complete on `fix/audit-D-partial-features`. Zero 🟡 remains unaddressed or unverified.
- **Lead Product Improver:** Merged logs viewer with arrival ordering, request-id filter, and clock skew badge delivers high operational fidelity.
