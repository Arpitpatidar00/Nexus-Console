import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ipc, CMD } from '@/shared/tauri';
import { remoteKeys } from './keys';
import { teleportResultSchema, type TeleportResult } from './remote.schema';

export function usePushImage(hostId: string) {
  const qc = useQueryClient();
  return useMutation<TeleportResult, Error, string>({
    mutationFn: (image: string) =>
      ipc(CMD.REMOTE_PUSH_IMAGE, { id: hostId, image }, teleportResultSchema),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: remoteKeys.snapshot(hostId) });
      void qc.invalidateQueries({ queryKey: remoteKeys.diskReport(hostId) });
    },
  });
}
