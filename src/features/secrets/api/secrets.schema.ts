import { z } from 'zod';

export const secretFindingSchema = z.object({
  id: z.string(),
  projectPath: z.string(),
  filePath: z.string(),
  lineNumber: z.number().nullable().optional(),
  ruleId: z.string(),
  ruleName: z.string(),
  severity: z.string(),
  maskedPreview: z.string(),
  remediation: z.string(),
});
export type SecretFinding = z.infer<typeof secretFindingSchema>;

export const secretsScanResultSchema = z.object({
  scannedProjects: z.number(),
  scannedFiles: z.number(),
  findings: z.array(secretFindingSchema),
});
export type SecretsScanResult = z.infer<typeof secretsScanResultSchema>;
