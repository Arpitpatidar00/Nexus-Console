import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ipc, ipcVoid, CMD } from '@/shared/tauri';
import { macleanKeys } from './keys';
import {
  cleanResultSchema,
  deepReportSchema,
  drillSchema,
  journalSchema,
  rulesSchema,
  type CleanRules,
} from './maclean.schema';

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

/** Native admin prompt, then a read-only root `du` (a couple of minutes).
 * A dismissed prompt is `cancelled`: no toast. */
export function useDeepScan() {
  return useMutation({
    mutationFn: () => ipc(CMD.MACLEAN_DEEP_SCAN, undefined, deepReportSchema),
    meta: { quiet: true },
  });
}

/** The biggest children of one map row, fetched when the row is opened. */
export function useDrill(id: string, open: boolean) {
  return useQuery({
    queryKey: ['maclean', 'drill', id],
    queryFn: () => ipc(CMD.MACLEAN_DRILL, { id }, drillSchema),
    enabled: open,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useReveal() {
  return useMutation({
    mutationFn: (path: string) => ipcVoid(CMD.MACLEAN_REVEAL, { path }),
    meta: { quiet: true },
  });
}

export function useOpenFullDiskAccess() {
  return useMutation({
    mutationFn: () => ipcVoid(CMD.MACLEAN_OPEN_FULL_DISK_ACCESS),
    meta: { quiet: true },
  });
}

export function useOpenUsersAndGroups() {
  return useMutation({
    mutationFn: () => ipcVoid(CMD.MACLEAN_OPEN_USERS_AND_GROUPS),
    meta: { quiet: true },
  });
}

export function useThinSnapshots() {
  return useMutation({
    mutationFn: () => ipc(CMD.MACLEAN_THIN_SNAPSHOTS, undefined, z.string()),
  });
}

export function useDeleteSnapshot() {
  return useMutation({
    mutationFn: (date: string) => ipc(CMD.MACLEAN_DELETE_SNAPSHOT, { date }, z.string()),
  });
}

export function useDeletePath() {
  return useMutation({
    mutationFn: (path: string) => ipc(CMD.MACLEAN_DELETE_PATH, { path }, z.string()),
  });
}
