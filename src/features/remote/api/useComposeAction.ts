import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ipcVoid, CMD } from '@/shared/tauri';
import { remoteKeys } from './keys';
import type { ComposeAction } from './remote.schema';

export function useComposeAction(hostId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ project, action }: { project: string; action: ComposeAction }) =>
      ipcVoid(CMD.REMOTE_COMPOSE_ACTION, { id: hostId, project, action }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: remoteKeys.snapshot(hostId) });
      void qc.invalidateQueries({ queryKey: remoteKeys.history(hostId) });
    },
  });
}
