import { z } from 'zod';

export const projectReleaseConfigSchema = z.object({
  project_path: z.string(),
  platform: z.string(),
  has_fastlane: z.boolean(),
  lanes: z.array(z.string()),
  version_name: z.string().nullable().optional(),
  build_number: z.string().nullable().optional(),
});
export type ProjectReleaseConfig = z.infer<typeof projectReleaseConfigSchema>;
