import { z } from 'zod';

export const dnsRecordSchema = z.object({
  recordType: z.string(),
  value: z.string(),
  ttl: z.number().nullable().optional(),
  raw: z.string(),
});
export type DnsRecord = z.infer<typeof dnsRecordSchema>;

export const dnsLookupResultSchema = z.object({
  domain: z.string(),
  records: z.array(dnsRecordSchema),
});
export type DnsLookupResult = z.infer<typeof dnsLookupResultSchema>;

export const sslCertResultSchema = z.object({
  domain: z.string(),
  valid: z.boolean(),
  issuer: z.string(),
  subject: z.string(),
  notBefore: z.string(),
  notAfter: z.string(),
  daysRemaining: z.number(),
  sans: z.array(z.string()),
  error: z.string().nullable().optional(),
});
export type SslCertResult = z.infer<typeof sslCertResultSchema>;

export const rdapResultSchema = z.object({
  domain: z.string(),
  registrar: z.string().nullable().optional(),
  expirationDate: z.string().nullable().optional(),
  createdDate: z.string().nullable().optional(),
  updatedDate: z.string().nullable().optional(),
  status: z.array(z.string()),
  error: z.string().nullable().optional(),
});
export type RdapResult = z.infer<typeof rdapResultSchema>;

export const propagationAnswerSchema = z.object({
  resolver: z.string(),
  resolverName: z.string(),
  records: z.array(z.string()),
  latencyMs: z.number(),
});
export type PropagationAnswer = z.infer<typeof propagationAnswerSchema>;

export const propagationResultSchema = z.object({
  domain: z.string(),
  recordType: z.string(),
  answers: z.array(propagationAnswerSchema),
});
export type PropagationResult = z.infer<typeof propagationResultSchema>;

export const uptimePingSchema = z.object({
  timestamp: z.number(),
  statusCode: z.number(),
  latencyMs: z.number(),
  isUp: z.boolean(),
  error: z.string().nullable().optional(),
});
export type UptimePing = z.infer<typeof uptimePingSchema>;

export const uptimeMonitorSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  intervalMins: z.number(),
  enabled: z.boolean(),
  lastStatus: z.number().nullable().optional(),
  lastLatencyMs: z.number().nullable().optional(),
  isUp: z.boolean(),
  uptimePercent24h: z.number(),
  history: z.array(uptimePingSchema),
  // Rust sends these too (`#[serde(default)]` on its side) — they were
  // missing here, so zod silently dropped them before anything could show a
  // last-ping time or an SSL countdown (Fix-6/ARC-05, unfreezing Uptime).
  lastPingTimestamp: z.number().nullable().optional(),
  sslDaysRemaining: z.number().nullable().optional(),
  lastCertWarnTimestamp: z.number().nullable().optional(),
});
export type UptimeMonitor = z.infer<typeof uptimeMonitorSchema>;
