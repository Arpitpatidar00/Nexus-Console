import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, CMD } from '@/shared/tauri';
import { remoteKeys } from './keys';
import {
  deployRecordSchema,
  deployPreviewSchema,
  deployResultSchema,
  type DeployRecord,
  type DeployPreview,
  type DeployResult,
} from './remote.schema';

const deployHistorySchema = z.array(deployRecordSchema);

export function useDeployHistory(hostId: string) {
  return useQuery<DeployRecord[]>({
    queryKey: remoteKeys.deploys(hostId),
    queryFn: () => ipc(CMD.REMOTE_GET_DEPLOYS, { id: hostId }, deployHistorySchema),
    staleTime: 10_000,
  });
}

export function useDeployPreview(hostId: string, project: string, enabled: boolean) {
  return useQuery<DeployPreview>({
    queryKey: remoteKeys.deployPreview(hostId, project),
    queryFn: () => ipc(CMD.REMOTE_PREVIEW_DEPLOY, { id: hostId, project }, deployPreviewSchema),
    enabled: enabled && !!project,
    staleTime: 15_000,
  });
}

export function useExecuteDeploy(hostId: string) {
  const qc = useQueryClient();
  return useMutation<DeployResult, Error, { project: string; services?: string[] }>({
    mutationFn: ({ project, services = [] }) =>
      ipc(CMD.REMOTE_EXECUTE_DEPLOY, { id: hostId, project, services }, deployResultSchema),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: remoteKeys.deploys(hostId) });
      void qc.invalidateQueries({ queryKey: remoteKeys.snapshot(hostId) });
    },
  });
}

export function useRollbackDeploy(hostId: string) {
  const qc = useQueryClient();
  return useMutation<DeployResult, Error, string>({
    mutationFn: (deployId) =>
      ipc(CMD.REMOTE_ROLLBACK_DEPLOY, { id: hostId, deployId }, deployResultSchema),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: remoteKeys.deploys(hostId) });
      void qc.invalidateQueries({ queryKey: remoteKeys.snapshot(hostId) });
    },
  });
}

export function usePromoteEnv() {
  const qc = useQueryClient();
  return useMutation<DeployResult, Error, { sourceId: string; targetId: string; project: string }>({
    mutationFn: ({ sourceId, targetId, project }) =>
      ipc(CMD.REMOTE_PROMOTE_ENV, { sourceId, targetId, project }, deployResultSchema),
    onSettled: (_d, _e, vars) => {
      void qc.invalidateQueries({ queryKey: remoteKeys.deploys(vars.targetId) });
      void qc.invalidateQueries({ queryKey: remoteKeys.snapshot(vars.targetId) });
    },
  });
}
