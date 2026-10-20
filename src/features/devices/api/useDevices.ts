import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, CMD } from '@/shared/tauri';
import {
  iosSimulatorSchema,
  androidAvdSchema,
  type IosSimulator,
  type AndroidAvd,
} from './devices.schema';

export const deviceKeys = {
  ios: () => ['devices', 'ios'] as const,
  android: () => ['devices', 'android'] as const,
};

export function useIosSimulators() {
  return useQuery<IosSimulator[]>({
    queryKey: deviceKeys.ios(),
    queryFn: () => ipc(CMD.DEVICES_LIST_IOS, {}, z.array(iosSimulatorSchema)),
    staleTime: 10_000,
  });
}

export function useControlIosSimulator() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { udid: string; action: 'boot' | 'shutdown' | 'open' | 'erase' }) =>
      ipc(CMD.DEVICES_CONTROL_IOS, args, z.string()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deviceKeys.ios() });
    },
  });
}

export function useAndroidAvds() {
  return useQuery<AndroidAvd[]>({
    queryKey: deviceKeys.android(),
    queryFn: () => ipc(CMD.DEVICES_LIST_ANDROID, {}, z.array(androidAvdSchema)),
    staleTime: 10_000,
  });
}

export function useLaunchAndroidAvd() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => ipc(CMD.DEVICES_LAUNCH_ANDROID, { name }, z.string()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deviceKeys.android() });
    },
  });
}
