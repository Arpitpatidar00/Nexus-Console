import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, ipcVoid, CMD } from '@/shared/tauri';
import { projectKeys } from './keys';
import {
  discoveredProjectSchema,
  gitHubStatusSchema,
  workspaceConfigSchema,
  savedCommandSchema,
  workspaceStepResultSchema,
  type DiscoveredProject,
  type GitHubStatus,
  type WorkspaceConfig,
  type SavedCommand,
} from './projects.schema';

export function useProjects(roots: string[] = [], { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<DiscoveredProject[]>({
    queryKey: projectKeys.discover(),
    queryFn: () => ipc(CMD.PROJECTS_DISCOVER, { roots }, z.array(discoveredProjectSchema)),
    staleTime: 10_000,
    enabled,
  });
}

export function useGitFetch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => ipcVoid(CMD.PROJECTS_GIT_FETCH, { path }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.discover() });
    },
  });
}

export function useDeleteMergedBranches() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { path: string; branches: string[] }) =>
      ipc(CMD.PROJECTS_DELETE_MERGED_BRANCHES, params, z.array(z.string())),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.discover() });
    },
  });
}

export function useGitHubStatus(path: string | null) {
  return useQuery<GitHubStatus>({
    queryKey: projectKeys.github(path ?? ''),
    queryFn: () => ipc(CMD.PROJECTS_GET_GITHUB_STATUS, { path: path! }, gitHubStatusSchema),
    enabled: Boolean(path),
    staleTime: 30_000,
  });
}

export function useWorkspaces() {
  return useQuery<WorkspaceConfig[]>({
    queryKey: projectKeys.workspaces(),
    queryFn: () => ipc(CMD.PROJECTS_LIST_WORKSPACES, undefined, z.array(workspaceConfigSchema)),
    staleTime: Infinity,
  });
}

export function useSaveWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: WorkspaceConfig) =>
      ipc(CMD.PROJECTS_SAVE_WORKSPACE, { config }, workspaceConfigSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.workspaces() });
    },
  });
}

export function useDeleteWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ipcVoid(CMD.PROJECTS_DELETE_WORKSPACE, { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.workspaces() });
    },
  });
}

export function useStartWorkspace() {
  return useMutation({
    mutationFn: (id: string) =>
      ipc(CMD.PROJECTS_START_WORKSPACE, { id }, z.array(workspaceStepResultSchema)),
  });
}

export function useStopWorkspace() {
  return useMutation({
    mutationFn: (id: string) =>
      ipc(CMD.PROJECTS_STOP_WORKSPACE, { id }, z.array(workspaceStepResultSchema)),
  });
}

export function useSavedCommands(projectPath: string | null) {
  return useQuery<SavedCommand[]>({
    queryKey: projectKeys.savedCommands(projectPath ?? ''),
    queryFn: () =>
      ipc(
        CMD.PROJECTS_LIST_SAVED_COMMANDS,
        { projectPath: projectPath! },
        z.array(savedCommandSchema),
      ),
    enabled: Boolean(projectPath),
  });
}

export function useSaveCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: SavedCommand) =>
      ipc(CMD.PROJECTS_SAVE_COMMAND, { command }, savedCommandSchema),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.savedCommands(vars.projectPath) });
    },
  });
}

export function useDeleteCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; projectPath: string }) =>
      ipcVoid(CMD.PROJECTS_DELETE_COMMAND, { id: params.id }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.savedCommands(vars.projectPath) });
    },
  });
}
