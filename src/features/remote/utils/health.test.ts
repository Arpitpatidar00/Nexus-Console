import { test, expect } from 'vitest';
import restarting from '../../../../fixtures/remote/container-restarting-unhealthy/snapshot.json';
import { snapshotSchema, type HostSnapshot } from '@/features/remote/api/remote.schema';
import { healthOf, issueCount, usedPct } from './health';

const real = snapshotSchema.parse(restarting);
const withFindings = (sev: HostSnapshot['findings'][number]['severity'][]): HostSnapshot => ({
  ...real,
  findings: sev.map((severity, i) => ({ ...real.findings[0], id: `f${i}`, severity })),
});

test('worst finding wins; info never warns', () => {
  expect(healthOf(undefined)).toBe('unknown');
  expect(healthOf(withFindings([]))).toBe('ok');
  expect(healthOf(withFindings(['green']))).toBe('ok');
  expect(healthOf(withFindings(['green', 'yellow']))).toBe('warn');
  expect(healthOf(withFindings(['yellow', 'red']))).toBe('critical');
  expect(healthOf(real)).toBe('critical');
});

test('issue count skips info findings', () => {
  expect(issueCount(withFindings(['red', 'yellow', 'green']))).toBe(2);
  expect(issueCount(undefined)).toBe(0);
});

test('used percentage matches df', () => {
  expect(usedPct(0, 0)).toBe(0);
  expect(usedPct(96, 4)).toBe(96);
});
