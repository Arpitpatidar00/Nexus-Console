import { test, expect } from 'vitest';
import type { RemoteHost } from '@/features/remote/api/remote.schema';
import { groupHosts, projectNames } from './grouping';

const host = (id: string, project: string, env: RemoteHost['env'], order = 0): RemoteHost => ({
  id,
  source: 'sshConfig',
  alias: id,
  manual: null,
  label: id,
  project,
  env,
  order,
});

test('projects A–Z (case-insensitive), Ungrouped last', () => {
  const g = groupHosts([
    host('a', 'Ungrouped', 'dev'),
    host('b', 'zeta', 'dev'),
    host('c', 'Alpha', 'dev'),
  ]);
  expect(g.map((x) => x.project)).toEqual(['Alpha', 'zeta', 'Ungrouped']);
});

test('inside a project: dev, staging, other, prod; then order, then label', () => {
  const g = groupHosts([
    host('prod-1', 'Fameo', 'prod'),
    host('dev-b', 'Fameo', 'dev', 2),
    host('stg', 'Fameo', 'staging'),
    host('dev-a', 'Fameo', 'dev', 1),
    host('misc', 'Fameo', 'other'),
  ]);
  expect(g[0].hosts.map((h) => h.id)).toEqual(['dev-a', 'dev-b', 'stg', 'misc', 'prod-1']);
});

test('project suggestions skip Ungrouped and dedupe', () => {
  expect(
    projectNames([
      host('a', 'Fameo', 'dev'),
      host('b', 'Fameo', 'prod'),
      host('c', 'Ungrouped', 'dev'),
    ]),
  ).toEqual(['Fameo']);
});
