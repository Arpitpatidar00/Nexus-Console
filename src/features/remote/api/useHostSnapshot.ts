import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ipc, CMD } from '@/shared/tauri';
import { useAppSelector } from '@/shared/state/hooks';
import { remoteKeys } from './keys';
import { snapshotSchema } from './remote.schema';

/** The probe for one host: enabled only on the Servers tab while the host is
 * connected (the focusManager pauses it when the window loses focus). Errors
 * render inline on the host, never as toasts; `busy` just skips a beat. */
export function useHostSnapshot(id: string | null, connected: boolean) {
  const onTab = useAppSelector((s) => s.ui.activeTab === 'servers');
  const pollMs = useAppSelector((s) => s.settings.remotePollIntervalMs);
  const enabled = id != null && onTab && connected;
  return useQuery({
    queryKey: remoteKeys.snapshot(id ?? ''),
    queryFn: () => ipc(CMD.REMOTE_SNAPSHOT, { id }, snapshotSchema),
    enabled,
    refetchInterval: enabled && pollMs > 0 ? pollMs : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: pollMs > 0,
    staleTime: 2_000,
    // A probe is one ssh round trip; retrying a dead host only delays the
    // error the user needs to see.
    retry: false,
    placeholderData: keepPreviousData,
    meta: { silent: true },
  });
}

/** Read-only view of a host's last snapshot (for list rows), never fetching. */
export function useCachedSnapshot(id: string) {
  return useQuery({
    queryKey: remoteKeys.snapshot(id),
    queryFn: () => ipc(CMD.REMOTE_SNAPSHOT, { id }, snapshotSchema),
    enabled: false,
    meta: { silent: true },
  });
}
