import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ipc, CMD } from '@/shared/tauri';
import { remoteKeys } from './keys';
import {
  serverDiskReportSchema,
  pruneResultSchema,
  type ServerDiskReport,
  type PruneResult,
} from './remote.schema';

export function useServerDiskReport(hostId: string, enabled: boolean) {
  return useQuery<ServerDiskReport>({
    queryKey: remoteKeys.diskReport(hostId),
    queryFn: () => ipc(CMD.REMOTE_DISK_REPORT, { id: hostId }, serverDiskReportSchema),
    enabled,
    staleTime: 15_000,
  });
}

export function usePruneBuilder(hostId: string) {
  const qc = useQueryClient();
  return useMutation<PruneResult, Error, void>({
    mutationFn: () => ipc(CMD.REMOTE_PRUNE_BUILDER, { id: hostId }, pruneResultSchema),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: remoteKeys.diskReport(hostId) });
      void qc.invalidateQueries({ queryKey: remoteKeys.snapshot(hostId) });
    },
  });
}

export function usePruneImages(hostId: string) {
  const qc = useQueryClient();
  return useMutation<PruneResult, Error, void>({
    mutationFn: () => ipc(CMD.REMOTE_PRUNE_IMAGES, { id: hostId }, pruneResultSchema),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: remoteKeys.diskReport(hostId) });
      void qc.invalidateQueries({ queryKey: remoteKeys.snapshot(hostId) });
    },
  });
}
