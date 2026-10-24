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

// Matches exactly what the Rust backend's `create_database_backup` has a
// branch for (`services/backups/mod.rs`) — 'sqlite' had no branch at all and
// 'mongodb' alone didn't match the Rust side's `"mongo"` arm; both would
// have failed with "unsupported database engine" the moment this schema's
// enum was ever actually offered in a form (AUDIT-2026-10-24 Fix-6/ARC-05).
export const backupConfigSchema = z.object({
  source: z.enum(['local', 'remote']),
  hostAlias: z.string().nullable().optional(),
  engine: z.enum(['postgres', 'mysql', 'mongo', 'mongodb']),
  database: z.string(),
  destinationDir: z.string().nullable().optional(),
});
export type BackupConfig = z.infer<typeof backupConfigSchema>;
