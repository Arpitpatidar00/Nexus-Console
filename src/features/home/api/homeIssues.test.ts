import { test, expect } from 'vitest';
import { collectIssues, lowDiskThreshold } from './homeIssues';

const GB = 1024 ** 3;

test('nothing measured → no issues', () => {
  expect(collectIssues({})).toEqual([]);
});

test('healthy inputs → no issues', () => {
  expect(
    collectIssues({
      services: [{ name: 'postgresql@16', status: 'started', healthy: true, port: 5432 }],
      disk: { freeBytes: 200 * GB, totalBytes: 500 * GB },
      memory: { pressure: 'normal' },
      monitors: [
        { id: 'a', name: 'API', url: 'https://x', enabled: true, isUp: true, history: [{}] },
      ],
      ports: [{ pid: 1, command: 'node', port: 3000, detached: false }],
      serverFindings: [{ hostId: 'h', host: 'prod', id: 'f', severity: 'yellow', summary: 'x' }],
    }),
  ).toEqual([]);
});

test('each source produces an issue that links to its fix, red first', () => {
  const issues = collectIssues({
    ports: [{ pid: 9, command: 'node', port: 3000, detached: true }],
    services: [{ name: 'redis', status: 'error', healthy: null, port: null }],
    disk: { freeBytes: 3 * GB, totalBytes: 500 * GB },
    memory: { pressure: 'warning' },
    monitors: [
      { id: 'a', name: 'API', url: 'https://x', enabled: true, isUp: false, history: [{}] },
    ],
    serverFindings: [
      { hostId: 'h', host: 'prod', id: 'disk', severity: 'red', summary: 'Disk 96% full' },
    ],
  });
  expect(issues.map((i) => i.tab)).toEqual([
    'services',
    'storage',
    'domains',
    'servers',
    'memory',
    'ports',
  ]);
  expect(issues.slice(0, 4).every((i) => i.severity === 'red')).toBe(true);
});

test('a monitor that never ran, or is paused, is not "down"', () => {
  expect(
    collectIssues({
      monitors: [
        { id: 'a', name: 'A', url: 'u', enabled: true, isUp: false, history: [] },
        { id: 'b', name: 'B', url: 'u', enabled: false, isUp: false, history: [{}] },
      ],
    }),
  ).toEqual([]);
});

test('low disk threshold is 10 GB or 5%, whichever is larger', () => {
  expect(lowDiskThreshold(100 * GB)).toBe(10 * GB);
  expect(lowDiskThreshold(1000 * GB)).toBe(50 * GB);
});
