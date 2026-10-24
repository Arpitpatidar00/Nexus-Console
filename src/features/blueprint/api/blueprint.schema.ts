import { z } from 'zod';

export const blueprintHostSchema = z.object({
  id: z.string(),
  alias: z.string().nullable().optional(),
  label: z.string(),
  project: z.string(),
  env: z.string(),
  // Mirrors Rust `ManualTarget` — without it a hand-added host round-trips
  // through import with no address and can never connect.
  manual: z
    .object({
      hostname: z.string(),
      user: z.string(),
      port: z.number(),
      identityFile: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});
export type BlueprintHost = z.infer<typeof blueprintHostSchema>;

export const blueprintTunnelSchema = z.object({
  id: z.string(),
  hostId: z.string(),
  localPort: z.number(),
  remotePort: z.number(),
  remoteHost: z.string(),
});
export type BlueprintTunnel = z.infer<typeof blueprintTunnelSchema>;

import { workspaceConfigSchema, savedCommandSchema } from '@/features/projects/api/projects.schema';

export const macleanRulesSchema = z.object({
  protectedNames: z.array(z.string()),
  projectRoots: z.array(z.string()),
  nextIdleDays: z.number(),
  logAgeDays: z.number(),
  staleNodeModulesDays: z.number(),
});
export type MacleanRules = z.infer<typeof macleanRulesSchema>;

export const macBlueprintSchema = z.object({
  schemaVersion: z.number(),
  exportedAtEpoch: z.number(),
  macHostname: z.string(),
  brewfile: z.string(),
  remoteHosts: z.array(blueprintHostSchema),
  tunnels: z.array(blueprintTunnelSchema),
  workspaces: z.array(workspaceConfigSchema),
  savedCommands: z.array(savedCommandSchema),
  macleanRules: macleanRulesSchema.nullable().optional(),
  vscodeExtensions: z.array(z.string()),
});
export type MacBlueprint = z.infer<typeof macBlueprintSchema>;

export const blueprintDiffReportSchema = z.object({
  missingFormulae: z.array(z.string()),
  missingCasks: z.array(z.string()),
  missingTaps: z.array(z.string()),
  missingHosts: z.array(blueprintHostSchema),
  conflictingHosts: z.array(blueprintHostSchema),
  missingWorkspaces: z.array(z.string()),
  missingExtensions: z.array(z.string()),
  macleanRulesDifferent: z.boolean(),
});
export type BlueprintDiffReport = z.infer<typeof blueprintDiffReportSchema>;

export const updateCheckResultSchema = z.object({
  hasUpdate: z.boolean(),
  currentVersion: z.string(),
  latestVersion: z.string(),
  releaseUrl: z.string(),
  releaseNotes: z.string().nullable().optional(),
});
export type UpdateCheckResult = z.infer<typeof updateCheckResultSchema>;
