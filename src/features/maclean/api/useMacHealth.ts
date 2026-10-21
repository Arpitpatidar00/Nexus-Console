import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, ipcVoid, CMD } from '@/shared/tauri';
import { macleanKeys } from './keys';
import {
  duplicateReportSchema,
  energyReportSchema,
  ghostScanReportSchema,
  trendsReportSchema,
} from './maclean.schema';

export function useGhostScan(enabled = true) {
  return useQuery({
    queryKey: macleanKeys.ghosts(),
    queryFn: () => ipc(CMD.MACLEAN_GHOST_SCAN, undefined, ghostScanReportSchema),
    enabled,
    staleTime: 60_000,
  });
}

export function useGhostClean() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => ipc(CMD.MACLEAN_GHOST_CLEAN, { ids }, z.number()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: macleanKeys.ghosts() });
      void qc.invalidateQueries({ queryKey: macleanKeys.report() });
    },
    meta: { quiet: true },
  });
}

export function useEnergyReport(polling = true) {
  return useQuery({
    queryKey: macleanKeys.energy(),
    queryFn: () => ipc(CMD.MACLEAN_ENERGY_SAMPLE, undefined, energyReportSchema),
    refetchInterval: polling ? 5000 : false,
    staleTime: 2000,
  });
}

export function usePauseService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (serviceName: string) => ipcVoid(CMD.MACLEAN_PAUSE_SERVICE, { serviceName }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: macleanKeys.energy() });
    },
    meta: { quiet: true },
  });
}

export function useStorageTrends() {
  return useQuery({
    queryKey: macleanKeys.trends(),
    queryFn: () => ipc(CMD.MACLEAN_TRENDS, undefined, trendsReportSchema),
    staleTime: 300_000,
  });
}

export function useDuplicateFiles(dirs?: string[], enabled = false) {
  return useQuery({
    queryKey: macleanKeys.duplicates(dirs),
    queryFn: () => ipc(CMD.MACLEAN_DUPLICATES_SCAN, { dirs }, duplicateReportSchema),
    enabled,
    staleTime: Infinity,
  });
}

export function useDeleteDuplicates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) => ipc(CMD.MACLEAN_DUPLICATES_DELETE, { paths }, z.number()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: macleanKeys.duplicates() });
      void qc.invalidateQueries({ queryKey: macleanKeys.report() });
    },
    meta: { quiet: true },
  });
}
