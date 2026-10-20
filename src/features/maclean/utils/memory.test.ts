import { test, expect } from 'vitest';
import memoryGolden from '../../../../fixtures/maclean/memory.json';
import { memorySchema } from '@/features/maclean/api/maclean.schema';
import { appendMem, memSample, swapState } from './memory';

const m = memorySchema.parse(memoryGolden);

test('swap: active only when pages are being written now', () => {
  expect(swapState(m)).toBe('active'); // golden: 200 KB/s
  expect(swapState({ ...m, swapoutBytesPerSec: 0 })).toBe('leftover');
  expect(swapState({ ...m, swapoutBytesPerSec: null })).toBe('leftover');
  expect(swapState({ ...m, swapoutBytesPerSec: 0, swapUsedBytes: 0 })).toBe('none');
});

test('samples and capped history', () => {
  const s = memSample(m);
  expect(s.usedPct).toBeGreaterThan(0);
  expect(s.swapPct).toBeGreaterThan(70);
  let h = appendMem([], s);
  h = appendMem(h, s);
  expect(h).toHaveLength(1);
  for (let i = 1; i <= 5; i++) h = appendMem(h, { ...s, at: s.at + i }, 3);
  expect(h).toHaveLength(3);
});
