import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, ipcVoid, CMD } from '@/shared/tauri';
import {
  blueprintDiffReportSchema,
  nexusBlueprintSchema,
  type BlueprintHost,
  type NexusBlueprint,
} from './blueprint.schema';

export function useBlueprintExport() {
  return useMutation({
    mutationFn: () => ipc(CMD.BLUEPRINT_EXPORT, undefined, nexusBlueprintSchema),
  });
}

export function useBlueprintAnalyze() {
  return useMutation({
    mutationFn: (blueprintJson: string) =>
      ipc(CMD.BLUEPRINT_ANALYZE_IMPORT, { blueprintJson }, blueprintDiffReportSchema),
  });
}

export function useApplyHomebrew() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (brewfile: string) => ipcVoid(CMD.BLUEPRINT_APPLY_HOMEBREW, { brewfile }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['packages'] });
      void qc.invalidateQueries({ queryKey: ['services'] });
    },
  });
}

export function useApplyHosts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hosts: BlueprintHost[]) => ipc(CMD.BLUEPRINT_APPLY_HOSTS, { hosts }, z.number()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['remote'] });
    },
  });
}

export function useApplyWorkspaces() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workspaces: NexusBlueprint['workspaces']) =>
      ipc(CMD.BLUEPRINT_APPLY_WORKSPACES, { workspaces }, z.number()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects', 'workspaces'] });
    },
  });
}

export function useApplyExtensions() {
  return useMutation({
    mutationFn: (extensions: string[]) =>
      ipc(CMD.BLUEPRINT_APPLY_EXTENSIONS, { extensions }, z.number()),
  });
}
