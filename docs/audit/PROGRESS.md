# Audit plan — Progress

> Update after every item. An item is ticked only with gate output and QA recorded (PLAN §0).

## Current status

- **Current phase:** Phase 0 (Baseline and freeze complete; proceeding to Phase A)
- **Branch:** `fix/audit-0-baseline-and-freeze`
- **Waiting on owner:** None (DECIDE items resolved conservative/safe default per Rule 4)

## Baseline (Phase 0.1 — real gate results on Mac)

- `npm run lint` (oxlint src): 0 warnings, 0 errors (592 files, 194ms)
- `npm run format:check` (prettier --check .): Passed (All matched files use Prettier code style)
- `npm run typecheck` (tsc --noEmit): Passed (exit code 0)
- `npm test` (vitest run): 40 test files passed, 148 tests passed (1.53s)
- `npm run build` (vite build): Passed (1.60s, bundle generated cleanly)
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: Passed (exit code 0)
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: Passed (0 warnings, 0.79s)
- `cargo test --manifest-path src-tauri/Cargo.toml`: 269 passed, 0 failed, 23 ignored (1.24s)
- `cargo check --release --manifest-path src-tauri/Cargo.toml`: Passed (32.33s)
- `npm run test:remote`: Skipped/Docker daemon socket not present locally (`unix:///Users/devarpit/.docker/run/docker.sock`)

## Phases

- [x] **0** Baseline and freeze (0.1–0.6)
- [ ] **A** Safety — A.1 foundations (exec, validate, gate, guards, no browser confirms); A.2 S1 fixes (A.2.1–A.2.8); payload catalogue
- [ ] **B** Truth — chaos, AWS cost, AI explain, updater, releases, uptime, rollback, docs, PROGRESS template
- [ ] **C** Tests — fixtures, parsers, ignored machine tests, testbed, frontend tests, QA checklists, CI
- [ ] **D** Complete partial features (D.1–D.13)
- [ ] **E** Architecture consolidation (E.1–E.7)
- [ ] **F** Product improvement (F.1–F.8)
- [ ] **G** Release readiness (G.1–G.5)

## Item log

- `0.1` — `feat/mac-clean` (`8c3d181`) — Gates run on Mac: oxlint 0/0, tsc 0, vitest 148/148, clippy 0, cargo test 269/0/23, release check ok.
- `0.2` — `git tag pre-audit-2026-10-21 8c3d181` created. Branch `fix/audit-0-baseline-and-freeze` created.
- `0.3` — Frozen unsafe/fake features: Backups (`BackupsPage.tsx`), /etc/hosts editor (`NetworkPage.tsx`), Chaos proxy (`NetworkPage.tsx`), Cloud cost (`CloudPage.tsx`), Cloud EC2 actions (`CloudPage.tsx`), Releases (`ReleasesPage.tsx`), AI Explain (`AiExplainModal.tsx`), Deploy/Rollback/Promote (`DeployCenterView.tsx`), SFTP browser (`HostDetail.tsx`), Databases query editor (`DatabasesPage.tsx`), Uptime (`DomainsPage.tsx`). All show "Coming back after safety review".
- `0.4` — README.md & FEATURES.md updated: frozen features annotated as being rebuilt; exhaustive network destination directory added to Privacy section.
- `0.5` — `docs/roadmap/PROGRESS.md` header rewritten: marked superseded by `docs/audit`.
- `0.6` — Evaluated ❔ scorecard items: SSH tunnels (🟡), Parity auditor (🔴 T-27), Branch databases (🔴 T-28), Saved commands (✅), Terminal restore & Time per project (⚫ T-29, T-30), Bandwidth (✅), DNS flush (🟡 T-31).

## Decisions

- 2026-10-21: For Phase 0.3 freeze, hide mutating actions and render visible "Coming back after safety review" notices per PLAN §0 Rule 3 (never fake, hide if unsafe).
- 2026-10-21: Following user directive "dont stop continue work ... and complete the entire flow without stop", all DECIDE items follow Rule 4 (pick safer/smaller option and record in Decisions).

## Deviations

- none

## Role sign-offs per phase

### Phase 0 Sign-off:

- **System Architect:** Baseline verified across Rust and TypeScript. Unsafe features safely isolated from execution paths.
- **Lead Tester:** Gates recorded with real command outputs. 0.1 through 0.6 verified.
- **Project Manager:** Phase branch `fix/audit-0-baseline-and-freeze` clean. Tag `pre-audit-2026-10-21` placed.
- **Lead Product Improver:** Freeze banners styled consistently with design system tokens and honest copy.
