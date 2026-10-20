import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ipc, ipcVoid, CMD } from '@/shared/tauri';
import { dockerKeys } from './keys';
import {
  dockerRuntimeStatusSchema,
  localContainersListSchema,
  type DockerRuntimeStatus,
  type LocalContainer,
} from './docker.schema';

export function useDockerRuntime() {
  return useQuery<DockerRuntimeStatus>({
    queryKey: dockerKeys.runtime(),
    queryFn: () => ipc(CMD.DOCKER_RUNTIME_STATUS, undefined, dockerRuntimeStatusSchema),
    refetchInterval: 10_000,
  });
}

export function useDockerContainers(enabled = true) {
  return useQuery<LocalContainer[]>({
    queryKey: dockerKeys.containers(),
    queryFn: () => ipc(CMD.DOCKER_LIST_CONTAINERS, undefined, localContainersListSchema),
    enabled,
    refetchInterval: 5_000,
  });
}

export function useDockerContainerAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { name: string; action: 'start' | 'stop' | 'restart' | 'remove' }) =>
      ipcVoid(CMD.DOCKER_CONTAINER_ACTION, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dockerKeys.containers() });
      queryClient.invalidateQueries({ queryKey: dockerKeys.runtime() });
    },
  });
}

export function useDockerComposeAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { project: string; action: 'start' | 'stop' | 'restart' }) =>
      ipcVoid(CMD.DOCKER_COMPOSE_ACTION, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dockerKeys.containers() });
    },
  });
}
