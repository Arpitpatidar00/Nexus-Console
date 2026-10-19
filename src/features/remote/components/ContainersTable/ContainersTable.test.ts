import { test, expect } from 'vitest';
import restarting from '../../../../../fixtures/remote/container-restarting-unhealthy/snapshot.json';
import { snapshotSchema, type Container } from '@/features/remote/api/remote.schema';
import { containerChip } from './ContainersTable.config';

const s = snapshotSchema.parse(restarting);
const byName = (n: string) => s.containers.find((c) => c.name === n) as Container;

test('real containers map to honest chips', () => {
  expect(containerChip(byName('nexus-testbed-crashy-1'))).toEqual({
    status: 'error',
    label: 'Restarting',
  });
  expect(containerChip(byName('nexus-testbed-sick-1'))).toEqual({
    status: 'error',
    label: 'Unhealthy',
  });
  expect(containerChip(byName('nexus-testbed-web-1'))).toEqual({
    status: 'running',
    label: 'Healthy',
  });
});

test('exit codes and other states', () => {
  const base = byName('nexus-testbed-web-1');
  expect(containerChip({ ...base, state: 'exited', exitCode: 0 }).label).toBe('Exited');
  expect(containerChip({ ...base, state: 'exited', exitCode: 137 }).label).toBe('Exited (137)');
  expect(containerChip({ ...base, state: 'paused' }).label).toBe('Paused');
  expect(containerChip({ ...base, health: null }).label).toBe('Running');
});
