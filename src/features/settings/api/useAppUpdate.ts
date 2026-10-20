import { useQuery } from '@tanstack/react-query';
import { ipc, CMD } from '@/shared/tauri';
import { updateCheckResultSchema } from '@/features/blueprint/api/blueprint.schema';

export function useAppUpdate(enabled = false) {
  return useQuery({
    queryKey: ['app', 'update'],
    queryFn: () => ipc(CMD.APP_CHECK_UPDATE, undefined, updateCheckResultSchema),
    enabled,
    staleTime: 3600_000,
  });
}
