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

import { composeActionSchema, runbookItemSchema } from './remote.schema';

// Inspection, disk, files, notes and history are checked against Rust's real
// output in contracts.test.ts.
test('parses compose actions and runbooks', () => {
  expect(composeActionSchema.parse('restart')).toBe('restart');
  expect(() => composeActionSchema.parse('kill')).toThrow();

  const runbook = runbookItemSchema.parse({
    id: 'rb_1',
    hostId: 'h_1',
    project: null,
    name: 'Tail Web Logs',
    command: 'docker logs -f --tail 100 web',
    description: 'Follows live web service logs',
  });
  expect(runbook.name).toBe('Tail Web Logs');
});

import {
  parityReportSchema,
  deployRecordSchema,
  deployPreviewSchema,
  teleportResultSchema,
} from './remote.schema';

test('parses Phase 5 parity report, deploy record, and teleport result', () => {
  const parity = parityReportSchema.parse({
    versions: [
      {
        name: 'node',
        localVersion: 'v20.10.0',
        remoteVersions: { h1: 'v20.10.0', h2: 'v18.17.0' },
        matches: false,
      },
    ],
    envKeys: [
      {
        key: 'STRIPE_SECRET',
        inLocal: true,
        inRemote: { h1: true, h2: false },
        sameValueWarning: true,
        sharedEnvironments: ['local', 'h1'],
      },
    ],
    drift: [],
  });
  expect(parity.versions[0].name).toBe('node');
  expect(parity.envKeys[0].sameValueWarning).toBe(true);

  const deploy = deployRecordSchema.parse({
    id: 'dep_123',
    hostId: 'h1',
    project: 'my-stack',
    deployedAt: 1792435438,
    services: [
      {
        service: 'web',
        image: 'ghcr.io/org/web:latest',
        digestBefore: 'sha256:aaa',
        digestAfter: 'sha256:bbb',
      },
    ],
    status: 'success',
    message: 'Deploy completed',
  });
  expect(deploy.status).toBe('success');

  const preview = deployPreviewSchema.parse({
    project: 'my-stack',
    servicesToUpdate: [],
    hasChanges: false,
  });
  expect(preview.hasChanges).toBe(false);

  const teleport = teleportResultSchema.parse({
    image: 'app:local',
    hostId: 'h1',
    archMatched: true,
    message: 'Teleported successfully',
  });
  expect(teleport.archMatched).toBe(true);
});
