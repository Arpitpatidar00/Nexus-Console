import { z } from 'zod';

export const discoveredDbSchema = z.object({
  name: z.string(),
  driver: z.string(),
  port: z.number(),
  source: z.string(),
  dataDir: z.string().nullable(),
});
export type DiscoveredDb = z.infer<typeof discoveredDbSchema>;

export const dbGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type DbGroup = z.infer<typeof dbGroupSchema>;

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
  groupId: z.string().nullable().optional().default(null),
});
export type DbConnection = z.infer<typeof dbConnectionSchema>;

export const createGroupInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
});
export type CreateGroupInput = z.infer<typeof createGroupInputSchema>;

export const updateGroupInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
});
export type UpdateGroupInput = z.infer<typeof updateGroupInputSchema>;

export const updateConnectionInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  driver: z.string().min(1),
  host: z.string().min(1),
  port: z.number(),
  user: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  database: z.string().nullable().optional(),
  tunnelId: z.string().nullable().optional(),
  allowWrites: z.boolean(),
  env: z.string(),
  dataDir: z.string().nullable().optional(),
  groupId: z.string().nullable().optional(),
});
export type UpdateConnectionInput = z.infer<typeof updateConnectionInputSchema>;

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

export const dbCustomMappingSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  sourceConnectionId: z.string(),
  sourceSchema: z.string(),
  sourceTable: z.string(),
  sourceColumn: z.string(),
  targetConnectionId: z.string(),
  targetSchema: z.string(),
  targetTable: z.string(),
  targetColumn: z.string(),
  notes: z.string().nullable().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type DbCustomMapping = z.infer<typeof dbCustomMappingSchema>;

export const saveCustomMappingInputSchema = z.object({
  id: z.string().optional(),
  groupId: z.string(),
  sourceConnectionId: z.string(),
  sourceSchema: z.string(),
  sourceTable: z.string(),
  sourceColumn: z.string(),
  targetConnectionId: z.string(),
  targetSchema: z.string(),
  targetTable: z.string(),
  targetColumn: z.string(),
  notes: z.string().nullable().optional(),
});
export type SaveCustomMappingInput = z.infer<typeof saveCustomMappingInputSchema>;

export const dbRejectedCandidateSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  sourceConnectionId: z.string(),
  sourceSchema: z.string(),
  sourceTable: z.string(),
  sourceColumn: z.string(),
  targetConnectionId: z.string(),
  targetSchema: z.string(),
  targetTable: z.string(),
  targetColumn: z.string(),
  createdAt: z.number(),
});
export type DbRejectedCandidate = z.infer<typeof dbRejectedCandidateSchema>;
