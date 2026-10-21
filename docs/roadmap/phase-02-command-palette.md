# Phase 2: Command Palette and Action Registry — Specification

> **Phase:** P2  
> **Target Branch:** `feat/mac-clean`  
> **Status:** Implementing

---

## 1. Overview & Goals

Phase 2 introduces a centralized, keyboard-first Command Palette (Cmd+K) and Action Registry (`src/shared/actions/`) across Stackroost.
It enables developers to:

- Instantly search and execute actions with zero friction (fuzzy query matching).
- Navigate to any module, trigger service start/stop/restart, kill busy ports, connect to remote servers, run Doctor scans, or trigger Mac Clean.
- View recently executed actions when query is empty.
- Maintain full safety: danger actions display danger styling and always invoke the standard native confirms; the palette never bypasses confirm gates.

---

## 2. Action Registry Architecture (`src/shared/actions/`)

### 2.1 Types (`types.ts`)

```typescript
export type ActionGroup =
  'navigation' | 'services' | 'ports' | 'remote' | 'maclean' | 'doctor' | 'terminal' | 'settings';

export interface ActionContext {
  dispatch: AppDispatch;
  navigate: (tab: Tab) => void;
}

export interface ActionItem {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
  group: ActionGroup;
  shortcut?: string;
  danger?: boolean;
  when?: (state: RootState) => boolean;
  run: (ctx: ActionContext) => void | Promise<void>;
}
```

### 2.2 Static Actions (`staticActions.ts`)

- **Navigation:** Jump to Services, Packages, Ports, Servers, Doctor, Mac Clean Storage, Memory, Claude Chats, Settings.
- **Terminal:** Open new terminal, Toggle terminal drawer.
- **Appearance:** Theme to Light, Dark, System.
- **Doctor:** Start Quick Scan, Start Deep Scan.
- **Mac Clean:** Rescan Storage, Clean Safe Caches.
- **Homebrew:** Update Homebrew, Start All Services, Stop All Services.

### 2.3 Dynamic Actions (`useDynamicActions.ts`)

- Populated from active store & queries:
  - Running/Stopped Services: "Start service: <name>", "Stop service: <name>", "Restart service: <name>".
  - Listening Ports: "Kill process on port <port> (<comm>)".
  - Configured Servers: "Connect to <server>", "Disconnect from <server>", "Terminal on <server>".

### 2.4 Fuzzy Scorer (`scorer.ts`)

Zero-dependency sub-millisecond ranking algorithm:

- Exact full match: 1000
- Prefix match on title: 500
- Word boundary prefix: 300
- Substring match: 150
- Subsequence fuzzy match: 50
- Keyword matches boosted by 80.
- Scores sorted descending; 0 = filtered out.

---

## 3. UI Implementation (`CommandDialog.tsx`)

- Triggered by `Cmd+K` or `Ctrl+K`, closed with `Esc`.
- Input field with fast autofocus and search icon.
- List grouped by sections with group headers.
- Full keyboard navigation: ↑, ↓, Enter to execute, Home/End.
- Recent actions stored in `localStorage` under `stackroost:recent-actions` (capped at 5).
- Danger actions display a subtle danger badge and trigger existing native confirm flows.

---

## 4. Verification & Quality Gates

- Vitest unit tests:
  - `scorer.test.ts`: ranking correctness, case insensitivity, keyword boosting, empty query handling.
  - `registry.test.ts`: unique action IDs, `when` conditional filtering.
- TypeScript check (`tsc --noEmit`).
- Prettier and Oxlint clean (`npm run lint && npm run format:check`).
- Rust clippy & unit tests green.
