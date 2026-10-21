import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ipc, ipcVoid, CMD } from '@/shared/tauri';
import { remoteKeys } from './keys';
import {
  tunnelConfigSchema,
  tunnelStatusSchema,
  type TunnelConfig,
  type TunnelStatus,
} from './remote.schema';

export interface AddTunnelInput {
  hostId: string;
  name: string;
  localPort: number;
  remoteHost?: string;
  remotePort: number;
  autoStart?: boolean;
}

export interface UpdateTunnelPatch {
  name?: string;
  localPort?: number;
  remoteHost?: string;
  remotePort?: number;
  autoStart?: boolean;
}

export function useAddTunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddTunnelInput): Promise<TunnelConfig> =>
      ipc(CMD.REMOTE_ADD_TUNNEL, { input }, tunnelConfigSchema),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: remoteKeys.tunnels() });
      void qc.invalidateQueries({ queryKey: remoteKeys.state() });
    },
  });
}

export function useUpdateTunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTunnelPatch }): Promise<TunnelConfig> =>
      ipc(CMD.REMOTE_UPDATE_TUNNEL, { id, patch }, tunnelConfigSchema),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: remoteKeys.tunnels() });
      void qc.invalidateQueries({ queryKey: remoteKeys.state() });
    },
  });
}

export function useRemoveTunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<void> => ipcVoid(CMD.REMOTE_REMOVE_TUNNEL, { id }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: remoteKeys.tunnels() });
      void qc.invalidateQueries({ queryKey: remoteKeys.state() });
    },
  });
}

export function useOpenTunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<TunnelStatus> =>
      ipc(CMD.REMOTE_OPEN_TUNNEL, { id }, tunnelStatusSchema),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: remoteKeys.tunnels() });
    },
  });
}

export function useCloseTunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<void> => ipcVoid(CMD.REMOTE_CLOSE_TUNNEL, { id }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: remoteKeys.tunnels() });
    },
  });
}
