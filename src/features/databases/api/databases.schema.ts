import { z } from 'zod';

export const discoveredDbSchema = z.object({
  name: z.string(),
  driver: z.string(),
  port: z.number(),
  source: z.string(),
  dataDir: z.string().nullable(),
});
export type DiscoveredDb = z.infer<typeof discoveredDbSchema>;

export const dbConnectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  driver: z.string(),
  host: z.string(),
  port: z.number(),
  user: z.string().nullable(),
  database: z.string().nullable(),
  tunnelId: z.string().nullable(),
  allowWrites: z.boolean(),
  env: z.string(),
  dataDir: z.string().nullable(),
});
export type DbConnection = z.infer<typeof dbConnectionSchema>;

export const tableSummarySchema = z.object({
  name: z.string(),
  schema: z.string(),
  estimatedRows: z.number(),
  sizePretty: z.string(),
});
export type TableSummary = z.infer<typeof tableSummarySchema>;

export const queryResultSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.array(z.any())),
  rowCount: z.number(),
  durationMs: z.number(),
});
export type QueryResult = z.infer<typeof queryResultSchema>;

export const dbSnapshotSchema = z.object({
  id: z.string(),
  service: z.string(),
  label: z.string(),
  path: z.string(),
  createdAt: z.number(),
  sizeBytes: z.number(),
});
export type DbSnapshot = z.infer<typeof dbSnapshotSchema>;
