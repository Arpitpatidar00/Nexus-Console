import { test, expect } from 'vitest';
// Golden JSON written by the Rust test `snapshot_json_golden` from real probe
// captures, so this checks the zod mirror against what Rust actually sends.
import restarting from '../../../../fixtures/remote/container-restarting-unhealthy/snapshot.json';
import pm2Host from '../../../../fixtures/remote/amazon-linux-2023-docker-pm2/snapshot.json';
import { journalSchema, remoteStateSchema, snapshotSchema } from './remote.schema';

test('parses the Rust snapshot of a restarting/unhealthy compose stack', () => {
  const s = snapshotSchema.parse(restarting);
  expect(s.containers.find((c) => c.name === 'nexus-testbed-sick-1')?.health).toBe('unhealthy');
  expect(s.findings[0].severity).toBe('red');
  expect(s.pm2).toBeNull();
});

test('parses the Rust snapshot of a PM2 host', () => {
  const s = snapshotSchema.parse(pm2Host);
  expect(s.pm2?.map((a) => a.name)).toContain('api');
});

test('the schema is strict about the wire shape', () => {
  expect(() =>
    snapshotSchema.parse({ ...restarting, docker: { state: 'sleepy', version: null } }),
  ).toThrow();
});

test('parses remote state for both host kinds', () => {
  const raw = {
    consent: { granted: true, grantedAtEpoch: 1792435438 },
    hosts: [
      {
        id: 'h_1',
        source: 'sshConfig',
        alias: 'fameo-prod',
        manual: null,
        label: 'Fameo API',
        project: 'Fameo',
        env: 'prod',
        order: 0,
      },
      {
        id: 'h_2',
        source: 'manual',
        alias: null,
        manual: { hostname: '10.0.0.5', user: 'ubuntu', port: 22, identityFile: null },
        label: 'ubuntu@10.0.0.5',
        project: 'Ungrouped',
        env: 'dev',
        order: 1,
      },
    ],
  };
  expect(remoteStateSchema.parse(raw).hosts).toHaveLength(2);
});

test('parses journal entries as Rust writes them', () => {
  const raw = [
    {
      atEpoch: 1792435438,
      hostId: 'h_1',
      hostLabel: 'Fameo API',
      env: 'prod',
      action: 'docker.restart',
      target: 'web',
      result: 'error',
      message: 'Error response from daemon: No such container: web',
    },
  ];
  expect(journalSchema.parse(raw)[0].result).toBe('error');
  expect(() => journalSchema.parse([{ ...raw[0], result: 'maybe' }])).toThrow();
});
