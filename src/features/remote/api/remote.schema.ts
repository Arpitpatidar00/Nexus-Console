import { z } from 'zod';

/** Field-for-field mirrors of the Rust DTOs in `src-tauri/src/remote/`. */

export const ENVS = ['dev', 'staging', 'prod', 'other'] as const;
export type HostEnv = (typeof ENVS)[number];

export const consentSchema = z.object({
  granted: z.boolean(),
  grantedAtEpoch: z.number().nullable(),
});

export const hostSchema = z.object({
  id: z.string(),
  source: z.enum(['sshConfig', 'manual']),
  alias: z.string().nullable(),
  manual: z
    .object({
      hostname: z.string(),
      user: z.string(),
      port: z.number(),
      identityFile: z.string().nullable(),
    })
    .nullable(),
  label: z.string(),
  project: z.string(),
  env: z.enum(ENVS),
  order: z.number(),
  autoConnect: z.boolean().default(false),
});
export type RemoteHost = z.infer<typeof hostSchema>;

export const tunnelConfigSchema = z.object({
  id: z.string(),
  hostId: z.string(),
  name: z.string(),
  localPort: z.number().int().min(1).max(65535),
  remoteHost: z.string().default('127.0.0.1'),
  remotePort: z.number().int().min(1).max(65535),
  autoStart: z.boolean().default(false),
});
export type TunnelConfig = z.infer<typeof tunnelConfigSchema>;

export const tunnelStateSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('open') }),
  z.object({ state: z.literal('reconnecting'), attempt: z.number() }),
  z.object({ state: z.literal('failed'), reason: z.string() }),
  z.object({ state: z.literal('closed') }),
]);
export type TunnelState = z.infer<typeof tunnelStateSchema>;

export const tunnelStatusSchema = z.object({
  config: tunnelConfigSchema,
  state: tunnelStateSchema,
  isMultiplexed: z.boolean(),
  connectionTemplate: z.string(),
});
export type TunnelStatus = z.infer<typeof tunnelStatusSchema>;

export const remoteStateSchema = z.object({
  consent: consentSchema,
  hosts: z.array(hostSchema),
  tunnels: z.array(tunnelConfigSchema).default([]),
});
export type RemoteState = z.infer<typeof remoteStateSchema>;

export const scannedHostSchema = z.object({
  alias: z.string(),
  hostname: z.string(),
  user: z.string(),
  port: z.number(),
  proxyJump: z.string().nullable(),
  imported: z.boolean(),
});
export const scanSchema = z.array(scannedHostSchema);
export type ScannedHost = z.infer<typeof scannedHostSchema>;

export const connectionSchema = z.object({
  connected: z.boolean(),
  latencyMs: z.number(),
});

export const statusSchema = z.array(z.object({ id: z.string(), connected: z.boolean() }));

const unitSchema = z.object({ unit: z.string(), description: z.string() });

export const hostFindingSchema = z.object({
  id: z.string(),
  severity: z.enum(['red', 'yellow', 'green']),
  tag: z.enum(['speed', 'storage', 'info']),
  target: z.string().nullable(),
  summary: z.string(),
  explain: z.string(),
  guide: z.array(z.string()).nullable(),
});
export type HostFinding = z.infer<typeof hostFindingSchema>;

export const containerSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  state: z.string(),
  status: z.string(),
  health: z.enum(['healthy', 'unhealthy', 'starting']).nullable(),
  restartCount: z.number(),
  restartPolicy: z.string().nullable(),
  exitCode: z.number().nullable(),
  cpuPct: z.number().nullable(),
  memBytes: z.number().nullable(),
  ports: z.string(),
  composeProject: z.string().nullable(),
  createdAt: z.string().nullable(),
});
export type Container = z.infer<typeof containerSchema>;

export const snapshotSchema = z.object({
  capturedAt: z.number(),
  probeMs: z.number(),
  system: z.object({
    hostname: z.string(),
    os: z.string(),
    kernel: z.string(),
    arch: z.string(),
    uptimeSecs: z.number(),
    rebootRequired: z.boolean(),
  }),
  cpu: z.object({
    cores: z.number(),
    usagePct: z.number().nullable(),
    load1: z.number(),
    load5: z.number(),
    load15: z.number(),
  }),
  memory: z.object({
    totalBytes: z.number(),
    availableBytes: z.number(),
    swapTotalBytes: z.number(),
    swapFreeBytes: z.number(),
  }),
  disks: z.array(
    z.object({
      mount: z.string(),
      fs: z.string(),
      totalBytes: z.number(),
      usedBytes: z.number(),
      availBytes: z.number(),
    }),
  ),
  docker: z.object({
    state: z.enum(['absent', 'noPermission', 'daemonDown', 'ok']),
    version: z.string().nullable(),
  }),
  containers: z.array(containerSchema),
  composeProjects: z.array(
    z.object({ name: z.string(), status: z.string(), configFiles: z.string() }),
  ),
  services: z.array(unitSchema),
  failedUnits: z.array(unitSchema),
  pm2: z
    .array(
      z.object({
        name: z.string(),
        status: z.string(),
        restarts: z.number(),
        cpu: z.number(),
        memBytes: z.number(),
      }),
    )
    .nullable(),
  ports: z.array(
    z.object({
      proto: z.string(),
      local: z.string(),
      port: z.number(),
      process: z.string().nullable(),
    }),
  ),
  recentErrors: z.array(z.string()),
  oomKills24h: z.number().nullable(),
  findings: z.array(hostFindingSchema),
  warnings: z.array(z.string()),
});
export type HostSnapshot = z.infer<typeof snapshotSchema>;

export const journalEntrySchema = z.object({
  atEpoch: z.number(),
  hostId: z.string(),
  hostLabel: z.string(),
  env: z.enum(ENVS),
  action: z.string(),
  target: z.string(),
  result: z.enum(['ok', 'error']),
  message: z.string(),
});
export const journalSchema = z.array(journalEntrySchema);
export type RemoteJournalEntry = z.infer<typeof journalEntrySchema>;

// --- Phase 4: Servers Depth Schemas ---

export const composeActionSchema = z.enum(['start', 'stop', 'restart']);
export type ComposeAction = z.infer<typeof composeActionSchema>;

export const nginxSiteSchema = z.object({
  name: z.string(),
  path: z.string(),
  enabled: z.boolean(),
  listenPorts: z.array(z.number()),
  serverNames: z.array(z.string()),
  ssl: z.boolean(),
  proxyPasses: z.array(z.string()),
});
export type NginxSite = z.infer<typeof nginxSiteSchema>;

export const cronJobSchema = z.object({
  schedule: z.string(),
  command: z.string(),
  user: z.string(),
  source: z.string(),
});
export type CronJob = z.infer<typeof cronJobSchema>;

export const inspectionDataSchema = z.object({
  nginxInstalled: z.boolean(),
  nginxRunning: z.boolean(),
  nginxSites: z.array(nginxSiteSchema),
  cronJobs: z.array(cronJobSchema),
});
export type InspectionData = z.infer<typeof inspectionDataSchema>;

export const dockerSpaceItemSchema = z.object({
  typeName: z.string(),
  total: z.string(),
  active: z.string(),
  size: z.string(),
  reclaimable: z.string(),
});
export type DockerSpaceItem = z.infer<typeof dockerSpaceItemSchema>;

export const serverDiskReportSchema = z.object({
  dfItems: z.array(dockerSpaceItemSchema),
  logSizes: z.array(z.tuple([z.string(), z.string()])),
  buildCacheReclaimable: z.string(),
});
export type ServerDiskReport = z.infer<typeof serverDiskReportSchema>;

export const pruneResultSchema = z.object({
  reclaimedBytes: z.number(),
  message: z.string(),
});
export type PruneResult = z.infer<typeof pruneResultSchema>;

export const remoteFileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  isDir: z.boolean(),
  sizeBytes: z.number(),
  modified: z.string(),
  permissions: z.string(),
});
export type RemoteFileEntry = z.infer<typeof remoteFileEntrySchema>;

export const remoteFileContentSchema = z.object({
  path: z.string(),
  content: z.string(),
  isSecret: z.boolean(),
  masked: z.boolean(),
  sizeBytes: z.number(),
});
export type RemoteFileContent = z.infer<typeof remoteFileContentSchema>;

export const hostNoteSchema = z.object({
  hostId: z.string(),
  content: z.string(),
  updatedAt: z.number(),
});
export type HostNote = z.infer<typeof hostNoteSchema>;

export const snapshotSummarySchema = z.object({
  capturedAt: z.number(),
  cpuCores: z.number(),
  cpuLoad1: z.number(),
  memTotalBytes: z.number(),
  memAvailBytes: z.number(),
  containerCount: z.number(),
  runningContainers: z.array(z.string()),
  containerImages: z.array(z.tuple([z.string(), z.string()])),
  diskUsage: z.array(z.tuple([z.string(), z.number(), z.number()])),
  failedUnits: z.array(z.string()),
  criticalFindingCount: z.number(),
});
export type SnapshotSummary = z.infer<typeof snapshotSummarySchema>;

export const snapshotDiffSchema = z.object({
  previousAt: z.number(),
  currentAt: z.number(),
  newContainers: z.array(z.string()),
  removedContainers: z.array(z.string()),
  restartedContainers: z.array(z.string()),
  imageChanges: z.array(z.string()),
  diskGrowth: z.array(z.string()),
  newFailedUnits: z.array(z.string()),
});
export type SnapshotDiff = z.infer<typeof snapshotDiffSchema>;

export const incidentSchema = z.object({
  id: z.string(),
  hostId: z.string(),
  findingId: z.string(),
  summary: z.string(),
  firstSeenAt: z.number(),
  lastSeenAt: z.number(),
  resolvedAt: z.number().nullable(),
});
export type Incident = z.infer<typeof incidentSchema>;

export const hostHistoryDtoSchema = z.object({
  summaries: z.array(snapshotSummarySchema),
  latestDiff: snapshotDiffSchema.nullable(),
  incidents: z.array(incidentSchema),
});
export type HostHistoryDto = z.infer<typeof hostHistoryDtoSchema>;

export const runbookItemSchema = z.object({
  id: z.string(),
  hostId: z.string().nullable(),
  project: z.string().nullable(),
  name: z.string(),
  command: z.string(),
  description: z.string().nullable(),
});
export type RunbookItem = z.infer<typeof runbookItemSchema>;

export const addRunbookInputSchema = z.object({
  hostId: z.string().nullable().optional(),
  project: z.string().nullable().optional(),
  name: z.string().min(1),
  command: z.string().min(1),
  description: z.string().nullable().optional(),
});
export type AddRunbookInput = z.infer<typeof addRunbookInputSchema>;
