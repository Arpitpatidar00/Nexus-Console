import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, CMD } from '@/shared/tauri';
import {
  networkInfoSchema,
  processBandwidthSchema,
  hostEntrySchema,
  type NetworkInfo,
  type ProcessBandwidth,
  type HostEntry,
  type ChaosProfile,
} from './network.schema';

export const networkKeys = {
  info: () => ['network', 'info'] as const,
  bandwidth: () => ['network', 'bandwidth'] as const,
  hosts: () => ['network', 'hosts'] as const,
};

export function useNetworkInfo() {
  return useQuery<NetworkInfo>({
    queryKey: networkKeys.info(),
    queryFn: () => ipc(CMD.NETWORK_GET_INTERFACES, {}, networkInfoSchema),
    staleTime: 30_000,
  });
}

export function useProcessBandwidth() {
  return useQuery<ProcessBandwidth[]>({
    queryKey: networkKeys.bandwidth(),
    queryFn: () => ipc(CMD.NETWORK_GET_BANDWIDTH, {}, z.array(processBandwidthSchema)),
    refetchInterval: 3000,
  });
}

export function useFlushDns() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => ipc(CMD.NETWORK_FLUSH_DNS, {}, z.string()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: networkKeys.info() });
    },
  });
}

export function useHostsEntries() {
  return useQuery<HostEntry[]>({
    queryKey: networkKeys.hosts(),
    queryFn: () => ipc(CMD.NETWORK_GET_HOSTS, {}, z.array(hostEntrySchema)),
    staleTime: 10_000,
  });
}

export function useSaveHosts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entries: HostEntry[]) => ipc(CMD.NETWORK_SAVE_HOSTS, { entries }, z.void()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: networkKeys.hosts() });
    },
  });
}

export function useStartChaosProxy() {
  return useMutation({
    mutationFn: (args: { targetPort: number; chaosPort: number; profile: ChaosProfile }) =>
      ipc(CMD.CHAOS_START_PROXY, args, z.string()),
  });
}

export function useSimulateChaos() {
  return useMutation({
    mutationFn: (profile: ChaosProfile) => ipc(CMD.CHAOS_SIMULATE, { profile }, z.boolean()),
  });
}
