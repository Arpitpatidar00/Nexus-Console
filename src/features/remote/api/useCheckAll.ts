import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ipc, CMD } from '@/shared/tauri';
import { remoteKeys } from './keys';
import { snapshotSchema } from './remote.schema';
import { useRemoteStatus } from './useRemoteStatus';

/** Probe every connected host at once (Rust runs at most 4 ssh at a time).
 * Results land in each host's snapshot cache, so the list's health dots
 * update; per-host failures show on that host as usual. */
export function useCheckAll() {
  const qc = useQueryClient();
  const status = useRemoteStatus();
  const [running, setRunning] = useState(false);
  const ids = [...(status.data ?? new Map<string, boolean>()).entries()]
    .filter(([, up]) => up)
    .map(([id]) => id);

  const run = async () => {
    setRunning(true);
    await Promise.allSettled(
      ids.map((id) =>
        qc.fetchQuery({
          queryKey: remoteKeys.snapshot(id),
          queryFn: () => ipc(CMD.REMOTE_SNAPSHOT, { id }, snapshotSchema),
          staleTime: 0,
          meta: { silent: true },
        }),
      ),
    );
    setRunning(false);
  };

  return { run, running, count: ids.length };
}
