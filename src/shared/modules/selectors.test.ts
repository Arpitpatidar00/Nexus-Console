import { test, expect } from 'vitest';
import { settingsReducer, setEnabledModules } from '@/shared/state/settingsSlice';
import { PRESETS } from '@/app/WelcomeScreen/WelcomeScreen.config';
import { MODULES, MODULE_GROUPS } from './modules.config';
import { DEFAULT_MODULES, isTabVisible, sanitizeModules, visibleTabs } from './selectors';

test('visibleTabs: only the enabled modules, registry order, Settings last', () => {
  expect(visibleTabs(['claude'])).toEqual(['archiver', 'settings']);
  expect(visibleTabs(['homebrew'])).toEqual(['services', 'packages', 'sessions', 'settings']);
  // Order comes from the registry, not from the order the user picked.
  expect(visibleTabs(['claude', 'homebrew'])).toEqual([
    'services',
    'packages',
    'sessions',
    'archiver',
    'settings',
  ]);
});

test('isTabVisible: Settings is reachable however the rest is configured', () => {
  expect(isTabVisible('settings', ['ports'])).toBe(true);
  expect(isTabVisible('services', ['ports'])).toBe(false);
});

test('sanitizeModules: no persisted settings → null (first run)', () => {
  expect(sanitizeModules(undefined, false)).toBeNull();
});

test('sanitizeModules: existing install without the key → everything on', () => {
  expect(sanitizeModules(undefined, true)).toEqual(DEFAULT_MODULES);
});

test('sanitizeModules: unknown ids are dropped, order normalized', () => {
  expect(sanitizeModules(['claude', 'nope', 'ports'], true)).toEqual(['ports', 'claude']);
});

test('sanitizeModules: garbage or empty fails OPEN, never a tabless window', () => {
  expect(sanitizeModules([], true)).toEqual(DEFAULT_MODULES);
  expect(sanitizeModules(['nope'], true)).toEqual(DEFAULT_MODULES);
  expect(sanitizeModules('homebrew', true)).toEqual(DEFAULT_MODULES);
  expect(sanitizeModules({ homebrew: true }, true)).toEqual(DEFAULT_MODULES);
});

test('setEnabledModules: normalizes order and drops unknown ids', () => {
  const state = settingsReducer(undefined, setEnabledModules(['claude', 'homebrew']));
  expect(state.enabledModules).toEqual(['homebrew', 'claude']);
});

test('setEnabledModules: emptying the list is a no-op (last module can never go)', () => {
  const one = settingsReducer(undefined, setEnabledModules(['doctor']));
  const still = settingsReducer(one, setEnabledModules([]));
  expect(still.enabledModules).toEqual(['doctor']);
});

test('Servers is opt-in: never part of the everything-on defaults', () => {
  expect(DEFAULT_MODULES).not.toContain('remote');
  expect(sanitizeModules(undefined, true)).not.toContain('remote');
  // An existing install's saved list (written before Servers existed) keeps it off.
  expect(sanitizeModules(['homebrew', 'ports', 'doctor', 'claude'], true)).not.toContain('remote');
  expect(sanitizeModules(['remote'], true)).toEqual(['remote']);
  expect(visibleTabs(['remote'])).toEqual(['servers', 'settings']);
});

test('no preset contains an optIn module', () => {
  const optInIds = MODULES.filter((m) => m.optIn).map((m) => m.id);
  expect(optInIds.length).toBeGreaterThan(0);
  for (const preset of PRESETS) {
    for (const optInId of optInIds) {
      expect(preset.modules).not.toContain(optInId);
    }
  }
});

test('module groups: all modules belong to a valid group in sentence case order', () => {
  const validGroupIds = MODULE_GROUPS.map((g) => g.id);
  for (const m of MODULES) {
    expect(validGroupIds).toContain(m.group);
  }
  expect(MODULE_GROUPS.map((g) => g.label)).toEqual(['Local', 'Remote', 'This Mac', 'Tools']);
});
