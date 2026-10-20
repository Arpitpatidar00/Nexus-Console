import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ipc, ipcVoid, CMD } from '@/shared/tauri';
import { macleanKeys } from './keys';
import { cleanResultSchema, journalSchema, rulesSchema, type CleanRules } from './maclean.schema';

/** Rust re-measures, asks once natively, cleans, journals. A cancel at the
 * sheet comes back as `cancelled` (no toast). The report is rescanned after. */
export function useClean() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => ipc(CMD.MACLEAN_CLEAN, { ids }, cleanResultSchema),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: macleanKeys.journal() });
      void qc.refetchQueries({ queryKey: macleanKeys.report() });
    },
    // Progress is shown on the plan itself; the ActivityBar's copy is Homebrew's.
    meta: { quiet: true },
  });
}

export function useCleanRules() {
  return useQuery({
    queryKey: macleanKeys.rules(),
    queryFn: () => ipc(CMD.MACLEAN_RULES, undefined, rulesSchema),
    staleTime: Infinity,
  });
}

export function useSetCleanRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rules: CleanRules) => ipcVoid(CMD.MACLEAN_SET_RULES, { rules }),
    onSettled: () => qc.invalidateQueries({ queryKey: macleanKeys.rules() }),
    // New rules change which items qualify: the next visit to Storage
    // rescans (invalidating an inactive query doesn't start a scan now).
    onSuccess: () => qc.invalidateQueries({ queryKey: macleanKeys.report(), refetchType: 'none' }),
    meta: { quiet: true },
  });
}

export function useCleanJournal(open: boolean) {
  return useQuery({
    queryKey: macleanKeys.journal(),
    queryFn: () => ipc(CMD.MACLEAN_JOURNAL, undefined, journalSchema),
    enabled: open,
  });
}
