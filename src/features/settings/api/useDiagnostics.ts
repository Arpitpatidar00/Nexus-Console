import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, ipcVoid, CMD } from '@/shared/tauri';
import { aboutInfoSchema, errorEntrySchema } from './diag.schema';

const keys = { about: ['app', 'about'] as const, errors: ['diag', 'errors'] as const };

export function useAbout() {
  return useQuery({
    queryKey: keys.about,
    queryFn: () => ipc(CMD.APP_ABOUT, undefined, aboutInfoSchema),
    staleTime: Infinity,
  });
}

export function useErrorLog() {
  return useQuery({
    queryKey: keys.errors,
    queryFn: () => ipc(CMD.DIAG_LIST_ERRORS, undefined, z.array(errorEntrySchema)),
    meta: { silent: true },
  });
}

export function useClearErrorLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => ipcVoid(CMD.DIAG_CLEAR_ERRORS),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.errors }),
  });
}

/** Build the redacted report in Rust and put it on the clipboard. */
export function useCopyDiagnostics() {
  return useMutation({
    mutationFn: async () => {
      const text = await ipc(CMD.DIAG_REPORT, undefined, z.string());
      await navigator.clipboard.writeText(text);
      return text;
    },
  });
}

export function useInstallUpdate() {
  return useMutation({
    mutationFn: () => ipcVoid(CMD.APP_INSTALL_UPDATE),
    meta: { label: 'Installing update' },
  });
}
