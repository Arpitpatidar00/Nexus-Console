import { z } from 'zod';

// Mirrors `services::brew::diagnose::ServiceDiagnosis` field-for-field.
export const diagnosisSchema = z.object({
  name: z.string(),
  cause: z.string().nullable(),
  fix: z
    .object({
      kind: z.enum(['runCommand', 'editConfig', 'freePort']),
      summary: z.string(),
      command: z.string().nullable(),
      path: z.string().nullable(),
      line: z.number().nullable(),
    })
    .nullable(),
  checks: z.array(
    z.object({ label: z.string(), command: z.string(), ok: z.boolean(), output: z.string() }),
  ),
  logPath: z.string().nullable(),
  logTail: z.array(z.string()),
});

export type ServiceDiagnosis = z.infer<typeof diagnosisSchema>;
