import { test, expect } from 'vitest';
import golden from '../../../../fixtures/maclean/report.json';
import { reportSchema } from '@/features/maclean/api/maclean.schema';
import { defaultSelection, diskTone, mapShares, selectedTotal } from './storage';

const r = reportSchema.parse(golden);

test("disk tone follows the script's thresholds", () => {
  expect(diskTone(74.9)).toBe('ok');
  expect(diskTone(75)).toBe('warn');
  expect(diskTone(89.9)).toBe('warn');
  expect(diskTone(90)).toBe('danger');
});

test('default plan: own default, not skipped, not empty', () => {
  const sel = defaultSelection(r.items);
  expect(sel.has('npm')).toBe(true);
  expect(sel.has('docker_images')).toBe(false); // the user's call
  expect(sel.has('docker_installer')).toBe(false); // skipped
});

test('selected total ignores skipped and empty items even if ticked', () => {
  const all = new Set(r.items.map((i) => i.id));
  expect(selectedTotal(r.items, all)).toBe(183_920_000 + 443_900_000);
});

test('map shares are of used space', () => {
  const s = mapShares(r);
  expect(s[0].share).toBeGreaterThan(0);
  expect(s.reduce((n, m) => n + m.share, 0)).toBeCloseTo(100, 0);
});
