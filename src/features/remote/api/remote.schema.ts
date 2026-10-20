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
