import { useQuery } from '@tanstack/react-query';
import { ipc, CMD } from '@/shared/tauri';
import { remoteKeys } from './keys';
import { hostHistoryDtoSchema, type HostHistoryDto } from './remote.schema';

export function useServerHistory(hostId: string, enabled: boolean) {
  return useQuery<HostHistoryDto>({
    queryKey: remoteKeys.history(hostId),
    queryFn: () => ipc(CMD.REMOTE_GET_HISTORY, { id: hostId }, hostHistoryDtoSchema),
    enabled,
    staleTime: 10_000,
  });
}
