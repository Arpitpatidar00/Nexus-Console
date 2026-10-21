import { test, expect } from 'vitest';
import { appContextSchema } from './schemas';

// Drift guard: if Rust's AppContext serialization changes shape, these fail.
test('parses a valid app context', () => {
  const ok = {
    platform: 'macos',
    arch: 'aarch64',
    brewPrefix: '/opt/homebrew',
    brewBin: '/opt/homebrew/bin/brew',
    brewVersion: '6.0.10',
    maxPtys: 8,
  };
  expect(appContextSchema.parse(ok)).toEqual(ok);
});

test('accepts null brew fields and defaults maxPtys', () => {
  const ok = {
    platform: 'macos',
    arch: 'x86_64',
    brewPrefix: null,
    brewBin: null,
    brewVersion: null,
    maxPtys: 8,
  };
  expect(() => appContextSchema.parse(ok)).not.toThrow();
  expect(appContextSchema.parse(ok).maxPtys).toBe(8);
});

test('rejects malformed context', () => {
  const bad = { platform: 'macos', arch: 'aarch64', brewPrefix: 123 };
  expect(() => appContextSchema.parse(bad)).toThrow();
});
