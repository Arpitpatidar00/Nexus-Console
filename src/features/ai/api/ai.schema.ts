import { z } from 'zod';

export const ollamaStatusSchema = z.object({
  online: z.boolean(),
  models: z.array(z.string()),
  endpoint: z.string(),
});
export type OllamaStatus = z.infer<typeof ollamaStatusSchema>;

export const explainResponseSchema = z.object({
  explanation: z.string(),
  model: z.string(),
});
export type ExplainResponse = z.infer<typeof explainResponseSchema>;
