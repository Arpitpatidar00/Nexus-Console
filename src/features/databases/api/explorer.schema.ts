import { z } from 'zod';

// Mirrors services/databases/explorer/mod.rs (checked by contracts.test.ts).

export const columnInfoSchema = z.object({
  name: z.string(),
  dataType: z.string(),
  nullable: z.boolean(),
  default: z.string().nullable(),
  isPrimary: z.boolean(),
  isUnique: z.boolean(),
  comment: z.string().nullable(),
  /** Share of sampled documents that have the field (MongoDB only). */
  presence: z.number().nullable(),
});
export type ColumnInfo = z.infer<typeof columnInfoSchema>;

export const indexInfoSchema = z.object({
  name: z.string(),
  columns: z.array(z.string()),
  unique: z.boolean(),
  primary: z.boolean(),
  method: z.string().nullable(),
  definition: z.string().nullable(),
});
export type IndexInfo = z.infer<typeof indexInfoSchema>;

export const tableInfoSchema = z.object({
  schema: z.string(),
  name: z.string(),
  kind: z.string(),
  rowEstimate: z.number().nullable(),
  sizeBytes: z.number().nullable(),
  comment: z.string().nullable(),
  columns: z.array(columnInfoSchema),
  indexes: z.array(indexInfoSchema),
});
export type TableInfo = z.infer<typeof tableInfoSchema>;

export const relationSchema = z.object({
  name: z.string(),
  fromSchema: z.string(),
  fromTable: z.string(),
  fromColumns: z.array(z.string()),
  toSchema: z.string(),
  toTable: z.string(),
  toColumns: z.array(z.string()),
  onDelete: z.string().nullable(),
  onUpdate: z.string().nullable(),
  inferred: z.boolean(),
});
export type Relation = z.infer<typeof relationSchema>;

export const dbSchemaSchema = z.object({
  engine: z.string(),
  database: z.string(),
  serverVersion: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  schemas: z.array(z.string()),
  tables: z.array(tableInfoSchema),
  relations: z.array(relationSchema),
});
export type DbSchema = z.infer<typeof dbSchemaSchema>;

export const browsePageSchema = z.object({
  rows: z.array(z.unknown()),
  total: z.number().nullable(),
  totalCapped: z.boolean(),
  durationMs: z.number(),
});
export type BrowsePage = z.infer<typeof browsePageSchema>;

export const FILTER_OPS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'startsWith',
  'isNull',
  'notNull',
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export interface Filter {
  column: string;
  op: FilterOp;
  value?: string;
}

export interface BrowseRequest {
  schema: string;
  table: string;
  columns: string[];
  filters: Filter[];
  search?: string;
  sort?: { column: string; desc: boolean };
  limit: number;
  offset: number;
}
