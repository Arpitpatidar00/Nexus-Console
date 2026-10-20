import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, ipcVoid, CMD } from '@/shared/tauri';
import { remoteKeys } from './keys';
import { runbookItemSchema, type RunbookItem, type AddRunbookInput } from './remote.schema';

const runbookListSchema = z.array(runbookItemSchema);

export function useRunbooks(hostId?: string, project?: string) {
  return useQuery<RunbookItem[]>({
    queryKey: remoteKeys.runbooks(hostId, project),
    queryFn: () =>
      ipc(
        CMD.REMOTE_GET_RUNBOOKS,
        { hostId: hostId ?? null, project: project ?? null },
        runbookListSchema,
      ),
    staleTime: 60_000,
  });
}

export function useAddRunbook() {
  const qc = useQueryClient();
  return useMutation<RunbookItem, Error, AddRunbookInput>({
    mutationFn: (input) => ipc(CMD.REMOTE_ADD_RUNBOOK, { input }, runbookItemSchema),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['remote', 'runbooks'] });
    },
  });
}

export function useRemoveRunbook() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => ipcVoid(CMD.REMOTE_REMOVE_RUNBOOK, { id }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['remote', 'runbooks'] });
    },
  });
}
