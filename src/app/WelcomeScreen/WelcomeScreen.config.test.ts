import { test, expect } from 'vitest';
import { DEFAULT_MODULES } from '@/shared/modules';
import { suggestModules } from './WelcomeScreen.config';

test('no tools → just the defaults', () => {
  expect(suggestModules([])).toEqual(DEFAULT_MODULES);
});

test('installed tools add their opt-in modules once', () => {
  const s = suggestModules(['docker', 'xcode', 'flutter', 'brew']);
  expect(s).toEqual(expect.arrayContaining([...DEFAULT_MODULES, 'docker', 'devices', 'releases']));
  expect(s.filter((m) => m === 'devices')).toHaveLength(1);
  expect(s).not.toContain('cloud');
});
