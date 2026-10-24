import { z } from 'zod';

export const processBandwidthSchema = z.object({
  process: z.string(),
  pid: z.number(),
  bytesIn: z.number(),
  bytesOut: z.number(),
});
export type ProcessBandwidth = z.infer<typeof processBandwidthSchema>;

export const networkInfoSchema = z.object({
  primaryInterface: z.string(),
  ipv4Address: z.string().nullable().optional(),
  ipv6Address: z.string().nullable().optional(),
  dnsServers: z.array(z.string()),
});
export type NetworkInfo = z.infer<typeof networkInfoSchema>;

export const hostEntrySchema = z.object({
  id: z.string(),
  ip: z.string(),
  hostnames: z.array(z.string()),
  comment: z.string().nullable().optional(),
  enabled: z.boolean(),
});
export type HostEntry = z.infer<typeof hostEntrySchema>;

export const chaosProfileSchema = z.object({
  latencyMs: z.number(),
  dropRatePct: z.number(),
  reject: z.boolean(),
});
export type ChaosProfile = z.infer<typeof chaosProfileSchema>;

export const chaosProxyInfoSchema = z.object({
  id: z.string(),
  targetPort: z.number(),
  chaosPort: z.number(),
  profile: chaosProfileSchema,
  active: z.boolean(),
});
export type ChaosProxyInfo = z.infer<typeof chaosProxyInfoSchema>;
