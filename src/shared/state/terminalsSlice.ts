import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit';
import { env } from '@/config/env';
import type { PtyTarget } from '@/shared/tauri/pty';

export type TerminalKind = 'cli' | 'logs';

export interface TerminalSession {
  id: string;
  title: string;
  target: PtyTarget;
  /** Derived from the target: one terminal per thing, reopening focuses it. */
  key: string;
}

/** Stable identity for "the same terminal": a second open of the same target
 * focuses the existing tab instead of spawning another PTY. */
export function terminalKey(t: PtyTarget): string {
  switch (t.type) {
    case 'brew':
      return `brew:${t.kind}:${t.formula}`;
    case 'remoteShell':
      return `remote:shell:${t.hostId}`;
    case 'remoteLogs':
      return `remote:logs:${t.hostId}:${t.container}`;
    case 'remoteExec':
      return `remote:exec:${t.hostId}:${t.container}`;
    case 'workspace':
      return `workspace:${t.projectPath}:${t.command}`;
  }
}

export interface TerminalsState {
  sessions: TerminalSession[];
  activeId: string | null;
  drawerOpen: boolean;
  cap: number;
}

const initialState: TerminalsState = {
  sessions: [],
  activeId: null,
  drawerOpen: false,
  cap: env.VITE_PTY_CAP ?? 8,
};

const terminalsSlice = createSlice({
  name: 'terminals',
  initialState,
  reducers: {
    // The ONE cross-feature seam: Services / Servers dispatch this; the terminal feature reacts.
    openTerminal: {
      reducer(state, action: PayloadAction<TerminalSession>) {
        const existing = state.sessions.find((s) => s.key === action.payload.key);
        const limit = state.cap ?? env.VITE_PTY_CAP ?? 8;
        if (existing) {
          state.activeId = existing.id;
        } else if (state.sessions.length < limit) {
          state.sessions.push(action.payload);
          state.activeId = action.payload.id;
        }
        state.drawerOpen = true;
      },
      prepare(input: { target: PtyTarget; title: string }) {
        return { payload: { ...input, id: nanoid(), key: terminalKey(input.target) } };
      },
    },
    closeTerminal(state, action: PayloadAction<string>) {
      const idx = state.sessions.findIndex((s) => s.id === action.payload);
      if (idx >= 0) state.sessions.splice(idx, 1);
      if (state.activeId === action.payload) {
        state.activeId = state.sessions.at(-1)?.id ?? null;
      }
      if (state.sessions.length === 0) state.drawerOpen = false;
    },
    setActiveTerminal(state, action: PayloadAction<string>) {
      state.activeId = action.payload;
      state.drawerOpen = true;
    },
    setDrawerOpen(state, action: PayloadAction<boolean>) {
      state.drawerOpen = action.payload;
    },
    setTerminalCap(state, action: PayloadAction<number>) {
      state.cap = action.payload;
    },
  },
});

export const { openTerminal, closeTerminal, setActiveTerminal, setDrawerOpen, setTerminalCap } =
  terminalsSlice.actions;
export const terminalsReducer = terminalsSlice.reducer;
