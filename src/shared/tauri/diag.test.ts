import { test, expect } from 'vitest';
import { shouldLog } from './diag';

test('the same error is logged once per minute', () => {
  expect(shouldLog('ipc:io:boom', 0)).toBe(true);
  expect(shouldLog('ipc:io:boom', 30_000)).toBe(false);
  expect(shouldLog('ipc:io:other', 30_000)).toBe(true);
  expect(shouldLog('ipc:io:boom', 61_000)).toBe(true);
});
