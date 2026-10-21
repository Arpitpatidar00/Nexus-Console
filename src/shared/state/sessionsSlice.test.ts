import { describe, it, expect } from 'vitest';
import {
  sessionsReducer,
  openRun,
  closeRun,
  clearAllSessions,
  hydrateSessions,
} from './sessionsSlice';

describe('sessionsSlice', () => {
  const initial = { runs: {}, hydrated: false };

  it('opens a run when none exists', () => {
    const state = sessionsReducer(initial, openRun({ formula: 'redis', startMs: 1000 }));
    expect(state.runs.redis).toHaveLength(1);
    expect(state.runs.redis[0]).toEqual({ startMs: 1000, endMs: null });
  });

  it('ignores openRun if the current run is already open', () => {
    let state = sessionsReducer(initial, openRun({ formula: 'redis', startMs: 1000 }));
    state = sessionsReducer(state, openRun({ formula: 'redis', startMs: 2000 }));
    expect(state.runs.redis).toHaveLength(1);
    expect(state.runs.redis[0].startMs).toBe(1000);
  });

  it('closes an active open run', () => {
    let state = sessionsReducer(initial, openRun({ formula: 'redis', startMs: 1000 }));
    state = sessionsReducer(state, closeRun({ formula: 'redis', endMs: 5000 }));
    expect(state.runs.redis[0]).toEqual({ startMs: 1000, endMs: 5000 });
  });

  it('clamps startMs to not precede previous run endMs', () => {
    let state = sessionsReducer(initial, openRun({ formula: 'redis', startMs: 1000 }));
    state = sessionsReducer(state, closeRun({ formula: 'redis', endMs: 5000 }));
    // Try opening with backdated startMs < 5000
    state = sessionsReducer(state, openRun({ formula: 'redis', startMs: 4000 }));
    expect(state.runs.redis).toHaveLength(2);
    expect(state.runs.redis[1].startMs).toBe(5000);
  });

  it('clears all sessions', () => {
    let state = sessionsReducer(initial, openRun({ formula: 'redis', startMs: 1000 }));
    state = sessionsReducer(state, clearAllSessions());
    expect(state.runs).toEqual({});
  });

  it('hydrates sessions from disk', () => {
    const loaded = {
      postgres: [{ startMs: 2000, endMs: 8000 }],
    };
    const state = sessionsReducer(initial, hydrateSessions(loaded));
    expect(state.hydrated).toBe(true);
    expect(state.runs.postgres).toEqual(loaded.postgres);
  });
});
