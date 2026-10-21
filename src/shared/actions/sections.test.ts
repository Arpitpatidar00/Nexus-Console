import { test, expect } from 'vitest';
import { paletteSections } from './sections';
import type { ActionItem } from './types';

const a = (id: string, group: ActionItem['group'] = 'navigation'): ActionItem => ({
  id,
  title: id,
  group,
  run: () => {},
});
const actions = [
  a('nav:home'),
  a('nav:ports'),
  a('svc:start:redis', 'services'),
  a('remote:connect:h1', 'remote'),
  a('remote:connect:h2', 'remote'),
];

test('no history → just the catalog by group', () => {
  const { sections } = paletteSections(actions, { pinnedIds: [], recentIds: [] });
  expect(sections.map((s) => s.group)).toEqual(['navigation', 'services', 'remote']);
});

test('repeat last, pinned, recent hosts, recent — each action once', () => {
  const { sections, flat } = paletteSections(actions, {
    pinnedIds: ['nav:ports', 'remote:connect:h2'],
    recentIds: ['svc:start:redis', 'remote:connect:h1', 'nav:ports', 'remote:connect:h2'],
  });
  expect(sections.map((s) => [s.group, s.items.map((i) => i.id)])).toEqual([
    ['repeat', ['svc:start:redis']],
    ['pinned', ['nav:ports', 'remote:connect:h2']],
    ['recentHosts', ['remote:connect:h1']],
    ['navigation', ['nav:home']],
  ]);
  expect(new Set(flat.map((i) => i.id)).size).toBe(flat.length);
  expect(flat).toHaveLength(actions.length);
});

test('ids that no longer exist (host removed, module off) are skipped', () => {
  const { sections } = paletteSections(actions, {
    pinnedIds: ['gone'],
    recentIds: ['also-gone'],
  });
  expect(sections.map((s) => s.group)).toEqual(['navigation', 'services', 'remote']);
});
