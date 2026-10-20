import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, CMD } from '@/shared/tauri';
import { remoteKeys } from './keys';
import {
  remoteFileEntrySchema,
  remoteFileContentSchema,
  type RemoteFileEntry,
  type RemoteFileContent,
} from './remote.schema';

const fileListSchema = z.array(remoteFileEntrySchema);

export function useRemoteFiles(hostId: string, path: string, enabled: boolean) {
  return useQuery<RemoteFileEntry[]>({
    queryKey: remoteKeys.files(hostId, path),
    queryFn: () => ipc(CMD.REMOTE_LIST_FILES, { id: hostId, path }, fileListSchema),
    enabled,
    staleTime: 10_000,
  });
}

export function useRemoteFileContent(
  hostId: string,
  path: string | null,
  reveal: boolean,
  enabled: boolean,
) {
  return useQuery<RemoteFileContent>({
    queryKey: remoteKeys.fileContent(hostId, path ?? '', reveal),
    queryFn: () =>
      ipc(CMD.REMOTE_READ_FILE, { id: hostId, path: path ?? '', reveal }, remoteFileContentSchema),
    enabled: enabled && path !== null,
    staleTime: 30_000,
  });
}
