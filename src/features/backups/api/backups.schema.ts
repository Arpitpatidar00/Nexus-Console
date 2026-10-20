import { z } from 'zod';

export const backupRecordSchema = z.object({
  id: z.string(),
  source_type: z.string(),
  source_name: z.string(),
  target_file: z.string(),
  size_bytes: z.number(),
  created_at: z.number(),
  status: z.string(),
});
export type BackupRecord = z.infer<typeof backupRecordSchema>;

export const backupConfigSchema = z.object({
  source: z.enum(['local', 'remote']),
  host_alias: z.string().nullable().optional(),
  engine: z.enum(['postgres', 'mysql', 'sqlite', 'mongodb']),
  database: z.string(),
  destination_dir: z.string().nullable().optional(),
});
export type BackupConfig = z.infer<typeof backupConfigSchema>;
