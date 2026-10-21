import { describe, it, expect } from 'vitest';
import type { Run } from '@/shared/state/sessionsSlice';

function computeTotalUptimeMs(runs: Run[], nowMs: number): number {
  return runs.reduce((sum, run) => {
    const end = run.endMs ?? nowMs;
    return sum + Math.max(0, end - run.startMs);
  }, 0);
}

describe('sessions calculations', () => {
  it('computes uptime for closed runs', () => {
    const runs: Run[] = [
      { startMs: 1000, endMs: 3000 },
      { startMs: 5000, endMs: 8000 },
    ];
    const total = computeTotalUptimeMs(runs, 10000);
    expect(total).toBe(2000 + 3000);
  });

  it('computes uptime for currently open run', () => {
    const runs: Run[] = [
      { startMs: 1000, endMs: 3000 },
      { startMs: 5000, endMs: null },
    ];
    const total = computeTotalUptimeMs(runs, 7000);
    expect(total).toBe(2000 + 2000);
  });

  it('handles empty runs array', () => {
    expect(computeTotalUptimeMs([], 10000)).toBe(0);
  });
});
