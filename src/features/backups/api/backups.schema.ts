import { z } from 'zod';

export const backupRecordSchema = z.object({
  id: z.string(),
  sourceType: z.string(),
  sourceName: z.string(),
  targetFile: z.string(),
  sizeBytes: z.number(),
  createdAt: z.number(),
  status: z.string(),
});
export type BackupRecord = z.infer<typeof backupRecordSchema>;

export const backupConfigSchema = z.object({
  source: z.enum(['local', 'remote']),
  hostAlias: z.string().nullable().optional(),
  engine: z.enum(['postgres', 'mysql', 'sqlite', 'mongodb']),
  database: z.string(),
  destinationDir: z.string().nullable().optional(),
});
export type BackupConfig = z.infer<typeof backupConfigSchema>;
