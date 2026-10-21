import { z } from 'zod';

/** Field-for-field mirrors of `core::consent` and `core::net` DTOs. */

export const CONSENT_SOURCES = [
  'ssh_config',
  'aws_config',
  'shell_history',
  'project_env',
  'library_scan',
] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

export const consentRecordSchema = z.object({
  source: z.enum(CONSENT_SOURCES),
  name: z.string(),
  granted: z.boolean(),
  grantedAtEpoch: z.number().nullable(),
});
export type ConsentRecord = z.infer<typeof consentRecordSchema>;

export const netDestinationSchema = z.object({
  id: z.string(),
  hostPattern: z.string(),
  purpose: z.string(),
  module: z.string(),
  outbound: z.boolean(),
  userConfigured: z.boolean(),
});
export type NetDestination = z.infer<typeof netDestinationSchema>;
