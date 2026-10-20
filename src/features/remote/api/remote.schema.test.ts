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

import {
  composeActionSchema,
  inspectionDataSchema,
  serverDiskReportSchema,
  pruneResultSchema,
  remoteFileEntrySchema,
  remoteFileContentSchema,
  hostNoteSchema,
  hostHistoryDtoSchema,
  runbookItemSchema,
} from './remote.schema';

test('parses Phase 4 inspection, disk report, and prune result', () => {
  expect(composeActionSchema.parse('restart')).toBe('restart');
  expect(() => composeActionSchema.parse('kill')).toThrow();

  const inspection = inspectionDataSchema.parse({
    nginxInstalled: true,
    nginxRunning: true,
    nginxSites: [
      {
        name: 'app.example.com',
        path: '/etc/nginx/sites-enabled/app.conf',
        enabled: true,
        listenPorts: [80, 443],
        serverNames: ['app.example.com'],
        ssl: true,
        proxyPasses: ['http://127.0.0.1:3000'],
      },
    ],
    cronJobs: [
      {
        schedule: '0 * * * *',
        command: '/usr/local/bin/backup.sh',
        user: 'root',
        source: 'crontab',
      },
    ],
  });
  expect(inspection.nginxSites).toHaveLength(1);
  expect(inspection.cronJobs[0].schedule).toBe('0 * * * *');

  const disk = serverDiskReportSchema.parse({
    dfItems: [
      {
        typeName: 'Images',
        total: '12',
        active: '4',
        size: '4.5GB',
        reclaimable: '2.1GB (46%)',
      },
    ],
    logSizes: [['web', '140MB']],
    buildCacheReclaimable: '1.2GB',
  });
  expect(disk.dfItems[0].typeName).toBe('Images');

  const prune = pruneResultSchema.parse({
    reclaimedBytes: 1048576,
    message: 'Deleted 14 build cache objects',
  });
  expect(prune.reclaimedBytes).toBe(1048576);
});

test('parses Phase 4 files, notes, history, and runbooks', () => {
  const file = remoteFileEntrySchema.parse({
    name: 'config.yaml',
    path: '/etc/app/config.yaml',
    isDir: false,
    sizeBytes: 2048,
    modified: '2026-10-20T10:00:00Z',
    permissions: '-rw-r--r--',
  });
  expect(file.isDir).toBe(false);

  const content = remoteFileContentSchema.parse({
    path: '.env',
    content: 'DATABASE_URL=***MASKED***',
    isSecret: true,
    masked: true,
    sizeBytes: 120,
  });
  expect(content.masked).toBe(true);

  const note = hostNoteSchema.parse({
    hostId: 'h_1',
    content: '# Maintainer\nCall ops team for reboot',
    updatedAt: 1792435438,
  });
  expect(note.content).toContain('Maintainer');

  const history = hostHistoryDtoSchema.parse({
    summaries: [],
    latestDiff: {
      previousAt: 100,
      currentAt: 200,
      newContainers: ['worker'],
      removedContainers: [],
      restartedContainers: [],
      imageChanges: [],
      diskGrowth: [],
      newFailedUnits: [],
    },
    incidents: [
      {
        id: 'inc_1',
        hostId: 'h_1',
        findingId: 'oom',
        summary: 'OOM kills detected',
        firstSeenAt: 100,
        lastSeenAt: 200,
        resolvedAt: null,
      },
    ],
  });
  expect(history.incidents).toHaveLength(1);
  expect(history.latestDiff?.newContainers).toEqual(['worker']);

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
