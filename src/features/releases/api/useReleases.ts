import { useQuery } from '@tanstack/react-query';
import { ipc, CMD } from '@/shared/tauri';
import { projectReleaseConfigSchema, type ProjectReleaseConfig } from './releases.schema';

export const releaseKeys = {
  config: (path: string) => ['releases', 'config', path] as const,
};

export function useProjectReleaseConfig(projectPath: string) {
  return useQuery<ProjectReleaseConfig>({
    queryKey: releaseKeys.config(projectPath),
    queryFn: () => ipc(CMD.RELEASES_DETECT_CONFIG, { projectPath }, projectReleaseConfigSchema),
    enabled: Boolean(projectPath),
    staleTime: 30_000,
  });
}
