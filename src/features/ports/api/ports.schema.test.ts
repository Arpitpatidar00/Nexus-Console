import { test, expect } from 'vitest';
import { portsSchema } from './ports.schema';

test('parses a port row with detached and project fields', () => {
  const raw = [
    {
      pid: 99615,
      command: 'redis-server',
      user: 'ankitjain',
      port: 6379,
      proto: 'IPv4',
      cpu: 0.1,
      memoryBytes: 2211840,
      detached: false,
      project: 'redis-backend',
    },
  ];
  const parsed = portsSchema.parse(raw);
  expect(parsed).toHaveLength(1);
  expect(parsed[0].detached).toBe(false);
  expect(parsed[0].project).toBe('redis-backend');
});

test('accepts null cpu/mem and defaults detached/project', () => {
  const raw = [
    {
      pid: 1,
      command: 'launchd',
      user: 'root',
      port: 80,
      proto: 'IPv6',
      cpu: null,
      memoryBytes: null,
    },
  ];
  const parsed = portsSchema.parse(raw);
  expect(parsed).toHaveLength(1);
  expect(parsed[0].detached).toBe(false);
  expect(parsed[0].project).toBeNull();
});
