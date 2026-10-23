import { z } from 'zod';

// Mirrors services/projects/runner.rs (runner.contracts.test.ts).

export const taskKindSchema = z.enum(['install', 'dev', 'start', 'build', 'test', 'lint', 'other']);
export type TaskKind = z.infer<typeof taskKindSchema>;

export const taskSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: taskKindSchema,
  steps: z.array(z.array(z.string())),
  source: z.string(),
  longRunning: z.boolean(),
});
export type Task = z.infer<typeof taskSchema>;

export const fixSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('runTask'), taskId: z.string() }),
  z.object({ kind: z.literal('createEnv'), from: z.string() }),
  z.object({ kind: z.literal('command'), text: z.string() }),
]);
export type Fix = z.infer<typeof fixSchema>;

export const checkSchema = z.object({
  id: z.string(),
  level: z.enum(['ok', 'warn', 'error']),
  title: z.string(),
  detail: z.string().nullable(),
  fix: fixSchema.nullable(),
});
export type Check = z.infer<typeof checkSchema>;

export const toolSchema = z.object({
  name: z.string(),
  label: z.string(),
  neededFor: z.string(),
  install: z.string(),
  found: z.boolean(),
  version: z.string().nullable(),
});
export type Tool = z.infer<typeof toolSchema>;

export const listenerSchema = z.object({ pid: z.number(), command: z.string(), port: z.number() });
export type Listener = z.infer<typeof listenerSchema>;

export const projectProfileSchema = z.object({
  path: z.string(),
  name: z.string(),
  stacks: z.array(z.string()),
  frameworks: z.array(z.string()),
  packageManager: z.string().nullable(),
  tasks: z.array(taskSchema),
  primary: z.string().nullable(),
  install: z.string().nullable(),
  deps: z.enum(['installed', 'missing', 'stale', 'notNeeded']),
  hasEnv: z.boolean(),
  envRead: z.boolean(),
  envTemplate: z.string().nullable(),
  envMissingKeys: z.array(z.string()),
  expectedPort: z.number().nullable(),
  tools: z.array(toolSchema),
  running: z.array(listenerSchema),
  checks: z.array(checkSchema),
});
export type ProjectProfile = z.infer<typeof projectProfileSchema>;
