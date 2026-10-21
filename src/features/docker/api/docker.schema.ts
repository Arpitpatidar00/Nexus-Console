import { z } from 'zod';

export const dockerRuntimeStatusSchema = z.object({
  runtime: z.string(),
  running: z.boolean(),
  containerCount: z.number(),
  version: z.string().nullable(),
});
export type DockerRuntimeStatus = z.infer<typeof dockerRuntimeStatusSchema>;

export const localContainerSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  state: z.string(),
  status: z.string(),
  health: z.string().nullable(),
  restartCount: z.number().default(0),
  restartPolicy: z.string().nullable().default(null),
  exitCode: z.number().nullable().default(null),
  cpuPct: z.number().nullable().default(null),
  memBytes: z.number().nullable().default(null),
  ports: z.string(),
  composeProject: z.string().nullable(),
  createdAt: z.string().nullable(),
});
export type LocalContainer = z.infer<typeof localContainerSchema>;

export const localContainersListSchema = z.array(localContainerSchema);
