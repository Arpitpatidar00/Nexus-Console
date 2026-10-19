import { useQuery } from '@tanstack/react-query';
import { ipc, CMD } from '@/shared/tauri';
import { useAppSelector } from '@/shared/state/hooks';
import { remoteKeys } from './keys';
import { statusSchema } from './remote.schema';

const STATUS_POLL_MS = 15_000;

/** Which hosts have a live ssh master (`ssh -O check`: local socket only, no
 * network). Polled only while the Servers tab is open and focused. */
export function useRemoteStatus() {
  const onTab = useAppSelector((s) => s.ui.activeTab === 'servers');
  return useQuery({
    queryKey: remoteKeys.status(),
    queryFn: () => ipc(CMD.REMOTE_STATUS, undefined, statusSchema),
    select: (rows) => new Map(rows.map((r) => [r.id, r.connected])),
    enabled: onTab,
    refetchInterval: onTab ? STATUS_POLL_MS : false,
    refetchIntervalInBackground: false,
    meta: { silent: true },
  });
}
