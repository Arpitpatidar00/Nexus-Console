import { useQuery } from '@tanstack/react-query';
import { ipc, CMD } from '@/shared/tauri';
import { remoteKeys } from './keys';
import { journalSchema, remoteStateSchema, scanSchema } from './remote.schema';

/** Consent + the host list, owned by Rust (`remote.json`). Changes only via
 * this app's own mutations, which invalidate it, so it never polls. */
export function useRemoteState() {
  return useQuery({
    queryKey: remoteKeys.state(),
    queryFn: () => ipc(CMD.REMOTE_STATE, undefined, remoteStateSchema),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/** Aliases in ~/.ssh/config, resolved via `ssh -G`. Only while the import
 * dialog is open and consent is granted (Rust refuses otherwise anyway). */
export function useRemoteScan(enabled: boolean) {
  return useQuery({
    queryKey: remoteKeys.scan(),
    queryFn: () => ipc(CMD.REMOTE_SCAN_CONFIG, undefined, scanSchema),
    enabled,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}

/** Every remote change this app made, newest first. Fetched while open. */
export function useRemoteJournal(open: boolean) {
  return useQuery({
    queryKey: remoteKeys.journal(),
    queryFn: () => ipc(CMD.REMOTE_JOURNAL, undefined, journalSchema),
    enabled: open,
  });
}
