import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ipc, ipcVoid, CMD, useIpcEvent } from '@/shared/tauri';
import { useAppSelector } from '@/shared/state/hooks';
import { macleanKeys } from './keys';
import {
  progressSchema,
  reportSchema,
  SCAN_PROGRESS_EVENT,
  type ScanProgress,
} from './maclean.schema';

/** The storage report. Scans once the first time the tab opens in a session
 * (read-only, ~20 s of `du`), then only on Rescan or after a clean; never on
 * focus or a timer. Progress streams in while it runs. */
export function useStorageReport() {
  const onTab = useAppSelector((s) => s.ui.activeTab === 'storage');
  const qc = useQueryClient();
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  useIpcEvent<unknown>(SCAN_PROGRESS_EVENT, (e) => {
    const p = progressSchema.safeParse(e.payload);
    if (p.success) setProgress(p.data);
  });
  const query = useQuery({
    queryKey: macleanKeys.report(),
    queryFn: async () => {
      setProgress(null);
      try {
        return await ipc(CMD.MACLEAN_SCAN, undefined, reportSchema);
      } finally {
        setProgress(null);
      }
    },
    enabled: onTab,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
  return {
    ...query,
    progress,
    rescan: () => void qc.refetchQueries({ queryKey: macleanKeys.report() }),
    cancel: () => void ipcVoid(CMD.MACLEAN_CANCEL_SCAN),
  };
}
