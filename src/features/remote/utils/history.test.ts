import { test, expect } from 'vitest';
import restarting from '../../../../fixtures/remote/container-restarting-unhealthy/snapshot.json';
import { snapshotSchema } from '@/features/remote/api/remote.schema';
import { appendSample, sampleOf, type Sample } from './history';

const s = (at: number, cpu: number | null = 10): Sample => ({ at, cpuPct: cpu, memPct: 50 });

test('sample from a real snapshot', () => {
  const snap = snapshotSchema.parse(restarting);
  const x = sampleOf(snap);
  expect(x.cpuPct).toBe(snap.cpu.usagePct);
  expect(x.memPct).toBeGreaterThan(0);
  expect(x.memPct).toBeLessThan(100);
});

test('append ignores repeats and stale samples, keeps the newest cap', () => {
  let h: Sample[] = [];
  h = appendSample(h, s(1));
  h = appendSample(h, s(1));
  h = appendSample(h, s(0));
  expect(h).toHaveLength(1);
  for (let i = 2; i <= 5; i++) h = appendSample(h, s(i), 3);
  expect(h.map((x) => x.at)).toEqual([3, 4, 5]);
});
