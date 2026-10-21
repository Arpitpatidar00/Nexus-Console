import { test, expect } from 'vitest';
import { aboutInfoSchema, errorEntrySchema } from './diag.schema';

test('parses About as Rust sends it', () => {
  expect(
    aboutInfoSchema.parse({
      version: '0.1.0',
      gitSha: '69d2a3c',
      buildEpoch: 1_760_000_000,
      arch: 'aarch64',
      macos: '15.1',
    }).gitSha,
  ).toBe('69d2a3c');
});

test('parses an error entry and rejects an unknown source', () => {
  const e = { epochMs: 1, source: 'panic', kind: 'panic', message: 'x', command: null };
  expect(errorEntrySchema.parse(e).source).toBe('panic');
  expect(() => errorEntrySchema.parse({ ...e, source: 'net' })).toThrow();
});
