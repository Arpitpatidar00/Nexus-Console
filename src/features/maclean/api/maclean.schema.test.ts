import { test, expect } from 'vitest';
// Golden JSON written by the Rust test `maclean_golden_report_json` from the
// real captures in fixtures/maclean, so this checks the zod mirror against
// what Rust actually sends.
import golden from '../../../../fixtures/maclean/report.json';
import memoryGolden from '../../../../fixtures/maclean/memory.json';
import { cleanResultSchema, memorySchema, reportSchema, rulesSchema } from './maclean.schema';

test('parses the Rust storage report', () => {
  const r = reportSchema.parse(golden);
  expect(r.volumes.find((v) => v.role === 'Preboot')?.oversized).toBe(true);
  expect(r.items.find((i) => i.id === 'docker_images')?.defaultSelected).toBe(false);
  expect(r.items.find((i) => i.id === 'docker_installer')?.skip).toContain('update');
  expect(r.map[0].bytes).toBeGreaterThanOrEqual(r.map.at(-1)!.bytes);
});

test('rejects a reshaped report', () => {
  expect(() => reportSchema.parse({ ...golden, items: [{ id: 'npm' }] })).toThrow();
});

test('clean result and rules', () => {
  expect(
    cleanResultSchema.parse({
      atEpoch: 1,
      freedBytes: 12_000_000_000,
      items: [{ id: 'npm', label: 'npm cache', ok: true, message: 'cleaned' }],
    }).freedBytes,
  ).toBe(12_000_000_000);
  expect(
    rulesSchema.parse({
      protectedNames: ['Fameo'],
      projectRoots: ['~/Desktop'],
      nextIdleDays: 7,
      logAgeDays: 7,
      staleNodeModulesDays: 60,
    }).protectedNames,
  ).toEqual(['Fameo']);
});

test('parses the Rust memory report', () => {
  const m = memorySchema.parse(memoryGolden);
  const c = m.composition;
  expect(c.usedBytes + c.cachedBytes + c.freeBytes).toBe(c.totalBytes);
  expect(m.pressure).toBe('warning');
  expect(m.topApps[0].bytes).toBeGreaterThanOrEqual(m.topApps[1].bytes);
});
