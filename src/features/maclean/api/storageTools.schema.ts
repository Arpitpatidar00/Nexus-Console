import { z } from 'zod';

// Mirrors services/maclean/projects.rs and appdata.rs (storage.contracts.test.ts).

export const artifactSchema = z.object({
  name: z.string(),
  path: z.string(),
  bytes: z.number(),
  rebuild: z.string(),
  blocked: z.string().nullable(),
});
export type Artifact = z.infer<typeof artifactSchema>;

export const projectSchema = z.object({
  name: z.string(),
  path: z.string(),
  display: z.string(),
  stacks: z.array(z.string()),
  lastActiveEpoch: z.number(),
  git: z.boolean(),
  protectedBy: z.string().nullable(),
  artifacts: z.array(artifactSchema),
  bytes: z.number(),
});
export type Project = z.infer<typeof projectSchema>;

export const projectsReportSchema = z.object({
  scannedAt: z.number(),
  roots: z.array(z.string()),
  projects: z.array(projectSchema),
  totalBytes: z.number(),
  protectedBytes: z.number(),
});
export type ProjectsReport = z.infer<typeof projectsReportSchema>;

export const spotKindSchema = z.enum(['cache', 'agentBackup', 'appManaged', 'models', 'history']);
export type SpotKind = z.infer<typeof spotKindSchema>;

export const spotChildSchema = z.object({
  path: z.string(),
  label: z.string(),
  bytes: z.number(),
  modifiedEpoch: z.number(),
});
export type SpotChild = z.infer<typeof spotChildSchema>;

export const appSpotSchema = z.object({
  id: z.string(),
  app: z.string(),
  label: z.string(),
  note: z.string(),
  kind: spotKindSchema,
  bytes: z.number(),
  paths: z.array(z.string()),
  running: z.boolean(),
  children: z.array(spotChildSchema),
});
export type AppSpot = z.infer<typeof appSpotSchema>;

export const appDataReportSchema = z.object({
  scannedAt: z.number(),
  spots: z.array(appSpotSchema),
  cleanableBytes: z.number(),
});
export type AppDataReport = z.infer<typeof appDataReportSchema>;
