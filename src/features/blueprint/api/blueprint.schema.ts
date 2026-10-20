import { z } from 'zod';

export const blueprintHostSchema = z.object({
  id: z.string(),
  alias: z.string().nullable().optional(),
  label: z.string(),
  project: z.string(),
  env: z.string(),
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

export const nexusBlueprintSchema = z.object({
  schemaVersion: z.number(),
  exportedAtEpoch: z.number(),
  macHostname: z.string(),
  brewfile: z.string(),
  remoteHosts: z.array(blueprintHostSchema),
  tunnels: z.array(blueprintTunnelSchema),
  workspaces: z.array(z.any()),
  savedCommands: z.array(z.any()),
  macleanRules: z.any().nullable().optional(),
  vscodeExtensions: z.array(z.string()),
});
export type NexusBlueprint = z.infer<typeof nexusBlueprintSchema>;

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
