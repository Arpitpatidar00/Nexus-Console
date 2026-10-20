import { z } from 'zod';

export const iosSimulatorSchema = z.object({
  udid: z.string(),
  name: z.string(),
  state: z.string(),
  runtime: z.string(),
  is_available: z.boolean(),
});
export type IosSimulator = z.infer<typeof iosSimulatorSchema>;

export const androidAvdSchema = z.object({
  name: z.string(),
  running: z.boolean(),
});
export type AndroidAvd = z.infer<typeof androidAvdSchema>;
