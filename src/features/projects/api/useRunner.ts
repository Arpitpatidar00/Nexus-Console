import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, ipcVoid, CMD } from '@/shared/tauri';
import { projectKeys } from './keys';
import { projectProfileSchema } from './runner.schema';

/** A project's profile: tasks, readiness checks, what's running. Polled while
 * something runs (or was just started) so ports and "Running" stay current. */
export function useProjectProfile(path: string | null, justStarted: boolean) {
  return useQuery({
    queryKey: projectKeys.profile(path ?? ''),
    queryFn: () => ipc(CMD.PROJECTS_PROFILE, { path }, projectProfileSchema),
    enabled: path != null,
    refetchInterval: (q) =>
      justStarted || (q.state.data?.running.length ?? 0) > 0 ? 4_000 : false,
    refetchOnWindowFocus: true,
    retry: false,
    meta: { silent: true },
  });
}

export function useCreateEnv(path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => ipc(CMD.PROJECTS_CREATE_ENV, { path }, z.string()),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.profile(path) }),
  });
}

export function useStopProjectProcess(path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pid: number) => ipcVoid(CMD.PROJECTS_STOP_PROCESS, { path, pid }),
    onSettled: () => qc.invalidateQueries({ queryKey: projectKeys.profile(path) }),
  });
}

export function useOpenProjectIn(path: string) {
  return useMutation({
    mutationFn: (target: 'vscode' | 'finder') => ipcVoid(CMD.PROJECTS_OPEN_IN, { path, target }),
    meta: { quiet: true },
  });
}

export const openLocalUrl = (port: number) =>
  ipcVoid(CMD.OPEN_IN_BROWSER, { url: `http://localhost:${port}` });
