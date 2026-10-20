import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ipc, CMD } from '@/shared/tauri';
import { useAppSelector } from '@/shared/state/hooks';
import { memorySchema } from './maclean.schema';

const POLL_MS = 3_000;

/** Live memory, polled only while the Memory tab is open and the window is
 * focused. Errors render inline (a poll must never stack toasts). */
export function useMemory() {
  const onTab = useAppSelector((s) => s.ui.activeTab === 'memory');
  return useQuery({
    queryKey: ['maclean', 'memory'],
    queryFn: () => ipc(CMD.MACLEAN_MEMORY, undefined, memorySchema),
    enabled: onTab,
    refetchInterval: onTab ? POLL_MS : false,
    refetchIntervalInBackground: false,
    staleTime: 0,
    placeholderData: keepPreviousData,
    meta: { silent: true },
  });
}
