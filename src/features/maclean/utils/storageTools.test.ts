import { test, expect } from 'vitest';
import contracts from '../../../../fixtures/maclean/storage-contracts.json';
import {
  appDataReportSchema,
  projectsReportSchema,
} from '@/features/maclean/api/storageTools.schema';
import {
  appDataSelectedBytes,
  idleBuckets,
  idleLabel,
  idleSelection,
  projectState,
  selectedBytes,
} from './storageTools';

// storage-contracts.json is written by Rust (`storage_contracts_golden`).
test.each([
  ['projects', projectsReportSchema, contracts.projects],
  ['app data', appDataReportSchema, contracts.appData],
] as const)('%s schema matches the Rust DTO exactly', (_n, schema, payload) => {
  expect(schema.parse(payload)).toEqual(payload);
});

const r = projectsReportSchema.parse(contracts.projects);
const now = 1_792_800_000;

test('idle selection skips protected projects and blocked folders', () => {
  // web: idle ~9 days, deletable. client: protected.
  expect([...idleSelection(r, 7, now)]).toEqual(['/Users/me/Desktop/web/node_modules']);
  expect(idleSelection(r, 30, now).size).toBe(0);
  expect(idleBuckets(r, now, [0, 7, 30])).toEqual([
    { days: 0, bytes: 600 },
    { days: 7, bytes: 600 },
    { days: 30, bytes: 0 },
  ]);
});

test('selection totals and project checkbox state', () => {
  const sel = new Set(['/Users/me/Desktop/web/node_modules']);
  expect(selectedBytes(r, sel)).toBe(600);
  expect(projectState(r.projects[0], sel)).toBe('all');
  expect(projectState(r.projects[0], new Set())).toBe('none');
  const a = appDataReportSchema.parse(contracts.appData);
  expect(
    appDataSelectedBytes(a, new Set(['slack_cache', '/Users/me/.gemini/tasks/c_1/backup'])),
  ).toBe(700);
});

test('idle labels read naturally', () => {
  expect(idleLabel(now, now)).toBe('today');
  expect(idleLabel(now - 86_400, now)).toBe('yesterday');
  expect(idleLabel(now - 12 * 86_400, now)).toBe('12 days ago');
  expect(idleLabel(now - 100 * 86_400, now)).toBe('3 months ago');
  expect(idleLabel(now - 800 * 86_400, now)).toBe('2 years ago');
});
