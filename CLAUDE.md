# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Stackroost** — a macOS desktop/menu-bar app: Tauri 2 (Rust) + React 19 + Vite + Tailwind v4.
It integrates six core modules:

1. **Homebrew** — local services, installed packages, and session management.
2. **Ports** — listening sockets, process inspection, and conflict resolution.
3. **Servers** — Linux server fleet management over OpenSSH (probes, Docker containers, systemd, live logs).
4. **Doctor** — read-only system and developer environment health diagnosis.
5. **Mac Clean** — storage disk usage breakdown, safe dev cache cleanup, and memory/swap monitor.
6. **Claude Chats** — Claude Code chat session browser, search, and JSON archive export.

macOS 11+, single window (`main`). The network surface is strictly limited to user-added remote servers over `/usr/bin/ssh` using the user's existing `~/.ssh/config` and keys (BatchMode for non-blocking probes; interactive PTY for terminal shells). Zero telemetry, zero third-party tracking, zero external accounts.

> **Ignore stack-specific `.claude/rules/*`.** Those files are auto-loaded but describe a
> _different_ project (Nexus ERP — NestJS, Prisma, MUI, `server/` + `nexus-fe/`, none of which
> exist here). Only their generic parts (YAGNI/reuse, code size, quality gates) transfer. Same for
> the `.claude/agents` and skills aimed at that ERP. `PRODUCT.md` is this repo's real design brief.

## Commands

Package manager is **npm** (`package-lock.json` is the tracked lockfile; CI runs `npm ci`).
Do not use or introduce pnpm or yarn files.

```bash
npm run setup        # fresh-Mac setup: checks Xcode CLT, brew, node ≥22.12, rustup — and installs
                     # what's missing (asks first). `npm run setup:check` = report only, no installs.
npm start            # the app (= tauri dev, vite on :1420); npm run dev is browser-only, IPC calls fail
npm run release      # = tauri build → src-tauri/target/release/bundle/ (first Rust build takes minutes)

npm run typecheck    # tsc --noEmit
npm run lint         # oxlint src   (not eslint)
npm run format       # prettier --write .
npm test             # vitest run
npx vitest run src/shared/brew/reconcile.test.ts     # single file
npx vitest run -t "reconcile merges intent"          # single test by name

cargo fmt    --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test   --manifest-path src-tauri/Cargo.toml
cargo test   --manifest-path src-tauri/Cargo.toml validate::   # single module
```

Git hooks (lefthook): **pre-commit** = oxlint + prettier + `cargo fmt --check` on staged files;
**pre-push** = typecheck, vitest, clippy `-D warnings`, cargo test. CI runs the same set on macOS.
`.lefthookrc` puts `~/.cargo/bin` on PATH so GUI git clients work. Emergency bypass: `LEFTHOOK=0`.

## Architecture

### The IPC boundary is the spine

`src/shared/tauri/invoke.ts` is the **only** module that imports `@tauri-apps/api/core`. Everything
crosses through `ipc(cmd, args, zodSchema)` (validates the Rust response) or `ipcVoid` (mutations).

Adding or changing a command touches **four** places, all of which must agree:

1. `src-tauri/src/commands/<domain>.rs` — `#[tauri::command]`, returns `AppResult<T>`; DTOs are
   `#[serde(rename_all = "camelCase")]`.
2. `src-tauri/src/lib.rs` — register in `generate_handler![...]`.
3. `src/shared/tauri/commands.ts` — add the name to `CMD` (no raw invoke strings anywhere).
4. A zod schema mirroring the Rust DTO field-for-field (`shared/tauri/schemas.ts`,
   `shared/brew/schemas.ts`, or `features/<domain>/api/*.schema.ts`).

Errors: Rust `AppError` serializes to `{kind, message, detail}` → `IpcError` on the JS side.
`app/queryClient.ts` toasts every query/mutation failure centrally — except `kind: 'cancelled'`
(a dismissed native confirm) and mutations flagged `meta.silent` (bulk ops toast once, aggregated).
Streaming commands emit events instead of returning (`doctor://finding`, `doctor://progress`,
PTY output); subscribe via `useIpcEvent`.

New Tauri API surface also needs its permission in `src-tauri/capabilities/default.json` —
`core:default` is read-only, so e.g. `window.show()` required `core:window:allow-show`.

### State: two systems, no overlap

- **React Query** — everything from Rust (services, packages, ports, doctor findings). Defaults in
  `app/queryClient.ts` (2s stale, refetch-on-focus, retry 1).
- **Redux Toolkit** — UI + user intent only: `ui`, `settings`, `serviceIntent`, `terminals`,
  `sessions`. `rootReducer`/`RootState` live in `shared/state` (nothing imports upward from `app/`).
  Persistence is listener middleware → `tauri-plugin-store` JSON files (`*Persist.ts`), hydrated
  once in `app/Bootstrap.tsx` (kicked at module scope so disk IO overlaps JS parse).

The Services tab's view model is `reconcile(managed, brewList, intent)` in `shared/brew/reconcile.ts`
— brew is the truth for started/stopped, but a started-yet-unhealthy service renders as `starting`,
not green.

### Startup / window contract (fragile — read before touching)

The window is `visible: false` in `tauri.conf.json`; `index.html` sets `data-theme` in a pre-module
script; `Bootstrap.tsx` paints the splash then calls `showMainWindow()`. `tauri-plugin-window-state`
is registered with `StateFlags::all() & !VISIBLE` — restoring VISIBLE would re-show the window early
and reintroduce the white flash. Closing the window hides to tray (services keep running); real quit
(`ExitRequested`) kills PTYs and stops explicitly-unlinked services.

### Rust conventions & Safety Foundations

- **Strict argv execution (`core::exec`):** Never build a shell string or invoke `/bin/sh -c` / `bash -c`. All commands execute as explicit argv slices (`core::exec::run`) with enforced timeouts. Architecture guard test `guard_no_shell_commands` strictly prevents unauthorized shell usage.
- **Strict type validation (`core::validate`):** All user-supplied identifiers, domains, hostnames, DB names, remote paths, and AWS profiles/regions must be validated newtypes (`HostName`, `DomainName`, `DbName`, `RemotePath`, etc.) that reject command injection payloads, control characters, and path traversals.
- **Mutation gate (`core::mutation`):** Every mutating command must acquire an RAII `MutationGuard` (`core::mutation::mutation` or `mutation_unattended`). Destructive operations require native macOS confirmation (`NSAlert`). Guard `guard_mutations_gated` scans all mutation commands. Every mutation is journaled on drop.
- **No ignored command outputs:** Guard `guard_no_ignored_outputs` enforces that command exits are checked and errors surfaced.
- **Zero browser dialogs:** Guard `guard_no_browser_confirms` ensures `window.confirm` and `window.alert` are never used.
- `BrewLock` serializes brew mutations; `ServicesCache` caches `brew services list --json` (~1.6s) keyed on TTL + the launchctl pid map — **every write command must `invalidate()` it**.
- Commands that shell out are `async` + `spawn_blocking` (`commands::blocking`) — a sync command freezes the UI on the poll loop.
- Doctor probes are **strictly read-only and must never wake a daemon** (querying watchman starts it — see `docs/doctor/SESSION-CONTEXT.md` §2). Mutations only via explicit `doctor_fix`/`vscode_*` commands. Every `Finding` carries an honest `Tag` (`speed`/`storage`/`info`) — never claim disk cleanup makes a machine faster.

### Frontend structure & styling

`src/features/<domain>/{api,components,pages}` + `src/shared/{brew,lib,state,tauri,ui,layout}`.
Folder-per-component (`Name.tsx` + `index.ts`, plus `.types.ts`/`.styles.ts`/`.config.ts`/`.test.ts`
only when needed), **named exports only**, `@/` → `src/`.

Pages are lazy per tab (`app/MainView.config.ts`) and the terminal drawer is lazy behind a gate that
sits _outside_ the lazy component. Barrel imports that would chain a whole feature graph into the
initial chunk are deliberately deep-imported instead — the comments in `App.tsx` mark them; check
the build for `INEFFECTIVE_DYNAMIC_IMPORT` before "fixing" one back to a barrel.

Styling is Tailwind v4 CSS-first: semantic tokens in `src/styles/theme.css` (`bg-canvas`, `text-fg`,
`border-border`, `text-accent`, status ramp), dark mode via `[data-theme='dark']` var overrides —
**never hardcode a hex, and don't scatter `dark:` utilities**. Component variants use `cva`
(`Button.styles.ts`). Dark mode is flat: 1px borders and tonal surfaces, no shadows. React Compiler
is on (Babel plugin) — don't hand-add `useMemo`/`useCallback` for memoization alone.

### Tests

Vitest runs in a **node** environment (no jsdom) — tests cover pure logic: schemas, reconcile,
formatters, power-state, report helpers. Rust logic lives in `#[cfg(test)] mod tests` next to the
code, with real command output captured in `fixtures/` for the parsers (`lsof`, `ps`, `launchctl`,
`brew`). Tests that hit real brew are `#[ignore]`d.

## Reference docs

`PRODUCT.md` (design principles / anti-references — the bar for any UI change), `PLAN.md`
(performance & native-feel phases, gitignored), `docs/doctor/PLAN.md` + `SESSION-CONTEXT.md`
(the Doctor phase plan and the measured findings + wrong turns it was built from).
