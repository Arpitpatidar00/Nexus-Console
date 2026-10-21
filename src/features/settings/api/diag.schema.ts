import { z } from 'zod';

/** Mirrors `commands::diag::AboutInfo`. */
export const aboutInfoSchema = z.object({
  version: z.string(),
  gitSha: z.string(),
  buildEpoch: z.number(),
  arch: z.string(),
  macos: z.string(),
});
export type AboutInfo = z.infer<typeof aboutInfoSchema>;

/** Mirrors `core::diag::ErrorEntry`. */
export const errorEntrySchema = z.object({
  epochMs: z.number(),
  source: z.enum(['ipc', 'ui', 'panic']),
  kind: z.string(),
  message: z.string(),
  command: z.string().nullable(),
});
export type ErrorEntry = z.infer<typeof errorEntrySchema>;
