import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ipc, CMD } from '@/shared/tauri';
import { remoteKeys } from './keys';
import { hostNoteSchema, type HostNote } from './remote.schema';

export function useHostNote(hostId: string) {
  return useQuery<HostNote>({
    queryKey: remoteKeys.note(hostId),
    queryFn: () => ipc(CMD.REMOTE_GET_NOTE, { id: hostId }, hostNoteSchema),
    staleTime: 60_000,
  });
}

export function useSaveHostNote(hostId: string) {
  const qc = useQueryClient();
  return useMutation<HostNote, Error, string>({
    mutationFn: (content: string) =>
      ipc(CMD.REMOTE_SAVE_NOTE, { id: hostId, content }, hostNoteSchema),
    onSuccess: (saved) => {
      qc.setQueryData(remoteKeys.note(hostId), saved);
    },
  });
}
