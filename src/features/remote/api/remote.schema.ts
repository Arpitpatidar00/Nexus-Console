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

// Mirrors services/remote/inspection.rs: one entry per nginx `server` block.
export const nginxRouteSchema = z.object({
  path: z.string(),
  target: z.string(),
  note: z.string().nullable(),
});
export type NginxRoute = z.infer<typeof nginxRouteSchema>;

export const nginxSiteSchema = z.object({
  file: z.string(),
  serverNames: z.array(z.string()),
  listenPorts: z.array(z.number()),
  ssl: z.boolean(),
  redirectOnly: z.boolean(),
  routes: z.array(nginxRouteSchema),
});
export type NginxSite = z.infer<typeof nginxSiteSchema>;

export const nginxUpstreamSchema = z.object({
  name: z.string(),
  servers: z.array(z.string()),
});
export type NginxUpstream = z.infer<typeof nginxUpstreamSchema>;

export const cronJobSchema = z.object({
  source: z.string(),
  user: z.string().nullable(),
  schedule: z.string(),
  command: z.string(),
});
export type CronJob = z.infer<typeof cronJobSchema>;

export const inspectionDataSchema = z.object({
  nginxInstalled: z.boolean(),
  nginxActive: z.boolean(),
  nginxSites: z.array(nginxSiteSchema),
  upstreams: z.array(nginxUpstreamSchema),
  cronJobs: z.array(cronJobSchema),
  reloadGuidance: z.string(),
});
export type InspectionData = z.infer<typeof inspectionDataSchema>;

// Mirrors services/remote/cleanup.rs.
export const dockerSpaceItemSchema = z.object({
  itemType: z.string(),
  total: z.string(),
  active: z.string(),
  size: z.string(),
  reclaimable: z.string(),
});
export type DockerSpaceItem = z.infer<typeof dockerSpaceItemSchema>;

export const serverDiskReportSchema = z.object({
  dockerSpace: z.array(dockerSpaceItemSchema),
  journalDiskUsage: z.string(),
  largeLogs: z.array(z.tuple([z.string(), z.string()])),
});
export type ServerDiskReport = z.infer<typeof serverDiskReportSchema>;

export const pruneResultSchema = z.object({
  reclaimed: z.string(),
  message: z.string(),
});
export type PruneResult = z.infer<typeof pruneResultSchema>;

// Mirrors services/remote/files.rs.
export const remoteFileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  isDir: z.boolean(),
  sizeBytes: z.number(),
  modifiedEpoch: z.number(),
  permissions: z.string(),
  isSecret: z.boolean(),
});
export type RemoteFileEntry = z.infer<typeof remoteFileEntrySchema>;

export const remoteFileContentSchema = z.object({
  path: z.string(),
  content: z.string(),
  sizeBytes: z.number(),
  isSecret: z.boolean(),
  isMasked: z.boolean(),
});
export type RemoteFileContent = z.infer<typeof remoteFileContentSchema>;

// Mirrors services/remote/logs.rs.
export const logLineSchema = z.object({
  at: z.string().nullable(),
  text: z.string(),
});
export type LogLine = z.infer<typeof logLineSchema>;

export const containerLogsSchema = z.object({
  container: z.string(),
  tail: z.number(),
  lines: z.array(logLineSchema),
});
export type ContainerLogs = z.infer<typeof containerLogsSchema>;

// Mirrors services/remote/notes.rs.
export const hostNoteSchema = z.object({
  hostId: z.string(),
  content: z.string(),
  updatedAtEpoch: z.number(),
});
export type HostNote = z.infer<typeof hostNoteSchema>;

// Mirrors services/remote/history.rs.
export const snapshotSummarySchema = z.object({
  atEpoch: z.number(),
  containerNames: z.array(z.string()),
  containerImages: z.record(z.string(), z.string()),
  containerRestarts: z.record(z.string(), z.number()),
  diskUsagePct: z.number(),
  failedUnits: z.array(z.string()),
  criticalFindingIds: z.array(z.string()),
});
export type SnapshotSummary = z.infer<typeof snapshotSummarySchema>;

export const snapshotDiffSchema = z.object({
  addedContainers: z.array(z.string()),
  removedContainers: z.array(z.string()),
  restartedContainers: z.array(z.string()),
  /** [container, previous image, current image] */
  changedImages: z.array(z.tuple([z.string(), z.string(), z.string()])),
  diskGrowthPct: z.number().nullable(),
  newFailedUnits: z.array(z.string()),
  resolvedFailedUnits: z.array(z.string()),
  newFindings: z.array(z.string()),
  resolvedFindings: z.array(z.string()),
});
export type SnapshotDiff = z.infer<typeof snapshotDiffSchema>;

export const incidentSchema = z.object({
  id: z.string(),
  hostId: z.string(),
  title: z.string(),
  openedAtEpoch: z.number(),
  resolvedAtEpoch: z.number().nullable(),
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

// --- Phase 5: Parity and Ship Schemas ---

export const versionItemSchema = z.object({
  name: z.string(),
  localVersion: z.string().nullable(),
  remoteVersions: z.record(z.string(), z.string().nullable()),
  matches: z.boolean(),
});
export type VersionItem = z.infer<typeof versionItemSchema>;

export const envKeyItemSchema = z.object({
  key: z.string(),
  inLocal: z.boolean(),
  inRemote: z.record(z.string(), z.boolean()),
  sameValueWarning: z.boolean(),
  sharedEnvironments: z.array(z.string()),
});
export type EnvKeyItem = z.infer<typeof envKeyItemSchema>;

export const driftItemSchema = z.object({
  service: z.string(),
  localImage: z.string().nullable(),
  remoteImages: z.record(z.string(), z.string().nullable()),
  inSync: z.boolean(),
});
export type DriftItem = z.infer<typeof driftItemSchema>;

export const parityReportSchema = z.object({
  versions: z.array(versionItemSchema),
  envKeys: z.array(envKeyItemSchema),
  drift: z.array(driftItemSchema),
});
export type ParityReport = z.infer<typeof parityReportSchema>;

export const serviceDigestSchema = z.object({
  service: z.string(),
  image: z.string(),
  digestBefore: z.string(),
  digestAfter: z.string().nullable(),
});
export type ServiceDigest = z.infer<typeof serviceDigestSchema>;

export const deployRecordSchema = z.object({
  id: z.string(),
  hostId: z.string(),
  project: z.string(),
  deployedAt: z.number(),
  services: z.array(serviceDigestSchema),
  status: z.string(),
  message: z.string(),
});
export type DeployRecord = z.infer<typeof deployRecordSchema>;

export const deployPreviewSchema = z.object({
  project: z.string(),
  servicesToUpdate: z.array(serviceDigestSchema),
  hasChanges: z.boolean(),
});
export type DeployPreview = z.infer<typeof deployPreviewSchema>;

export const deployResultSchema = z.object({
  record: deployRecordSchema,
  logs: z.string(),
});
export type DeployResult = z.infer<typeof deployResultSchema>;

export const teleportResultSchema = z.object({
  image: z.string(),
  hostId: z.string(),
  archMatched: z.boolean(),
  message: z.string(),
});
export type TeleportResult = z.infer<typeof teleportResultSchema>;

export const parityAuditInputSchema = z.object({
  localProjectPath: z.string().nullable().optional(),
  hostIds: z.array(z.string()),
  remoteAppPaths: z.record(z.string(), z.string()),
});
export type ParityAuditInput = z.infer<typeof parityAuditInputSchema>;
