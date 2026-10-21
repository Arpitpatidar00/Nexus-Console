import { z } from 'zod';

/** Mirrors Rust `AppContext` (serde camelCase). brew* are null when Homebrew
 * isn't found. maxPtys is the single source of truth for the terminal cap (8).
 * This schema is the drift guard between Rust and TS. */
export const appContextSchema = z.object({
  platform: z.string(),
  arch: z.string(),
  brewPrefix: z.string().nullable(),
  brewBin: z.string().nullable(),
  brewVersion: z.string().nullable(),
  maxPtys: z.number().int().positive().default(8),
});
export type AppContext = z.infer<typeof appContextSchema>;

/** Mirrors Rust `AppError` serialization. */
export const appErrorSchema = z.object({
  kind: z.enum(['shell', 'parse', 'invalidName', 'forbidden', 'notFound', 'io']),
  message: z.string(),
  detail: z.string().optional(),
});
