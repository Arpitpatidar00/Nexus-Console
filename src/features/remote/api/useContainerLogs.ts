import { useQuery } from '@tanstack/react-query';
import { ipc, CMD } from '@/shared/tauri';
import { useAppSelector } from '@/shared/state/hooks';
import { remoteKeys } from './keys';
import { containerLogsSchema } from './remote.schema';

export const LIVE_REFRESH_MS = 3_000;

/** The last `tail` lines of one container. `live` re-reads them every few
 * seconds while the Servers tab is open; errors render inline, never as toasts. */
export function useContainerLogs(
  hostId: string,
  container: string | null,
  tail: number,
  live: boolean,
) {
  const onTab = useAppSelector((s) => s.ui.activeTab === 'servers');
  const enabled = container != null && onTab;
  return useQuery({
    queryKey: remoteKeys.containerLogs(hostId, container ?? '', tail),
    queryFn: () =>
      ipc(CMD.REMOTE_CONTAINER_LOGS, { id: hostId, container, tail }, containerLogsSchema),
    enabled,
    refetchInterval: enabled && live ? LIVE_REFRESH_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: false,
    // Keep the lines on screen while the tail size changes, but never show one
    // container's log under another's name.
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[3] === container ? prev : undefined),
    meta: { silent: true },
  });
}
