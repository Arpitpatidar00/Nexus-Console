import { describe, it, expect } from 'vitest';
import { dockerRuntimeStatusSchema, localContainerSchema } from './docker.schema';

describe('docker.schema', () => {
  it('parses valid runtime status', () => {
    const raw = {
      runtime: 'OrbStack',
      running: true,
      containerCount: 3,
      version: '24.0.7',
    };
    const parsed = dockerRuntimeStatusSchema.parse(raw);
    expect(parsed.runtime).toBe('OrbStack');
    expect(parsed.running).toBe(true);
    expect(parsed.containerCount).toBe(3);
  });

  it('parses local container info', () => {
    const raw = {
      id: 'abc12345',
      name: 'redis-local',
      image: 'redis:alpine',
      state: 'running',
      status: 'Up 2 hours',
      health: 'healthy',
      ports: '0.0.0.0:6379->6379/tcp',
      composeProject: 'backend',
      createdAt: '2026-10-21',
    };
    const parsed = localContainerSchema.parse(raw);
    expect(parsed.name).toBe('redis-local');
    expect(parsed.state).toBe('running');
    expect(parsed.composeProject).toBe('backend');
  });
});
