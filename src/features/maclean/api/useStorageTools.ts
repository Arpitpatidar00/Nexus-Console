import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ipc, CMD } from '@/shared/tauri';
import { macleanKeys } from './keys';
import { cleanResultSchema } from './maclean.schema';
import { appDataReportSchema, projectsReportSchema } from './storageTools.schema';

/** Projects and their build output. A scan walks the project folders (~10 s
 * on a busy Desktop): run when the tab opens, kept until a clean or Rescan. */
export function useProjectsScan(enabled: boolean) {
  return useQuery({
    queryKey: macleanKeys.projects(),
    queryFn: () => ipc(CMD.MACLEAN_PROJECTS_SCAN, undefined, projectsReportSchema),
    enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useAppDataScan(enabled: boolean) {
  return useQuery({
    queryKey: macleanKeys.appData(),
    queryFn: () => ipc(CMD.MACLEAN_APPDATA_SCAN, undefined, appDataReportSchema),
    enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** Rust re-checks every path against its own last scan, confirms natively,
 * deletes, journals. Both reports are rescanned after: sizes moved. */
export function useCleanProjects() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) => ipc(CMD.MACLEAN_CLEAN_PROJECTS, { paths }, cleanResultSchema),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: macleanKeys.journal() });
      void qc.refetchQueries({ queryKey: macleanKeys.projects() });
      void qc.invalidateQueries({ queryKey: macleanKeys.report(), refetchType: 'none' });
    },
    meta: { quiet: true },
  });
}

export function useCleanAppData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targets: string[]) =>
      ipc(CMD.MACLEAN_CLEAN_APPDATA, { targets }, cleanResultSchema),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: macleanKeys.journal() });
      void qc.refetchQueries({ queryKey: macleanKeys.appData() });
      void qc.invalidateQueries({ queryKey: macleanKeys.report(), refetchType: 'none' });
    },
    meta: { quiet: true },
  });
}
