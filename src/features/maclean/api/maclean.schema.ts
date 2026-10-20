import { z } from 'zod';

/** Field-for-field mirrors of the Rust DTOs in `src-tauri/src/maclean/`. */

export const SCAN_PROGRESS_EVENT = 'maclean://progress';
export const CLEAN_EVENT = 'maclean://clean';

export const progressSchema = z.object({ label: z.string(), done: z.number(), total: z.number() });
export type ScanProgress = z.infer<typeof progressSchema>;

export const cleanEventSchema = z.object({
  id: z.string(),
  state: z.enum(['running', 'done', 'error']),
  message: z.string(),
});
export type CleanEvent = z.infer<typeof cleanEventSchema>;

const cleanItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  bytes: z.number(),
  skip: z.string().nullable(),
  defaultSelected: z.boolean(),
  note: z.string().nullable(),
  detail: z.array(z.string()),
});
export type CleanItem = z.infer<typeof cleanItemSchema>;

export const reportSchema = z.object({
  scannedAt: z.number(),
  scanMs: z.number(),
  disk: z.object({
    totalBytes: z.number(),
    usedBytes: z.number(),
    freeBytes: z.number(),
    dataUsedBytes: z.number(),
  }),
  map: z.array(
    z.object({ id: z.string(), label: z.string(), bytes: z.number(), note: z.string().nullable() }),
  ),
  volumes: z.array(
    z.object({
      role: z.string(),
      label: z.string(),
      why: z.string(),
      bytes: z.number(),
      oversized: z.boolean(),
    }),
  ),
  causes: z.array(z.object({ bytes: z.number().nullable(), text: z.string(), fix: z.string() })),
  items: z.array(cleanItemSchema),
  insights: z.array(z.object({ id: z.string(), text: z.string(), detail: z.array(z.string()) })),
  largeFiles: z.array(z.object({ path: z.string(), bytes: z.number() })),
});
export type StorageReport = z.infer<typeof reportSchema>;

export const cleanResultSchema = z.object({
  atEpoch: z.number(),
  freedBytes: z.number(),
  items: z.array(
    z.object({ id: z.string(), label: z.string(), ok: z.boolean(), message: z.string() }),
  ),
});
export type CleanResult = z.infer<typeof cleanResultSchema>;

export const rulesSchema = z.object({
  protectedNames: z.array(z.string()),
  projectRoots: z.array(z.string()),
  nextIdleDays: z.number(),
  logAgeDays: z.number(),
  staleNodeModulesDays: z.number(),
});
export type CleanRules = z.infer<typeof rulesSchema>;

export const journalSchema = z.array(
  z.object({
    atEpoch: z.number(),
    items: z.array(z.string()),
    freedBytes: z.number(),
    errors: z.array(z.string()),
  }),
);
export type CleanJournal = z.infer<typeof journalSchema>;

export const memorySchema = z.object({
  sampledAtMs: z.number(),
  composition: z.object({
    totalBytes: z.number(),
    appBytes: z.number(),
    wiredBytes: z.number(),
    compressedBytes: z.number(),
    cachedBytes: z.number(),
    freeBytes: z.number(),
    usedBytes: z.number(),
  }),
  pressure: z.enum(['normal', 'warning', 'critical', 'unknown']),
  swapTotalBytes: z.number(),
  swapUsedBytes: z.number(),
  swapoutBytesPerSec: z.number().nullable(),
  uptimeSecs: z.number(),
  restartSuggested: z.boolean(),
  topApps: z.array(z.object({ name: z.string(), processes: z.number(), bytes: z.number() })),
});
export type MemoryReport = z.infer<typeof memorySchema>;

const causeSchema = z.object({ bytes: z.number().nullable(), text: z.string(), fix: z.string() });

export const deepReportSchema = z.object({
  entries: z.array(
    z.object({ label: z.string(), why: z.string(), bytes: z.number(), flagged: z.boolean() }),
  ),
  causes: z.array(causeSchema),
});
export type DeepReport = z.infer<typeof deepReportSchema>;

export const drillSchema = z.array(z.object({ name: z.string(), bytes: z.number() }));
