import { useMutation, useQuery } from '@tanstack/react-query';
import { ipc, ipcVoid, CMD } from '@/shared/tauri';
import { diagnosisSchema } from './diagnosis.schema';

/** Read-only self-check + log tail. Fresh on every open — the point is to see
 * whether the last fix worked. */
export function useServiceDiagnosis(name: string, enabled: boolean) {
  return useQuery({
    queryKey: ['brew', 'diagnose', name],
    queryFn: () => ipc(CMD.SERVICES_DIAGNOSE, { name }, diagnosisSchema),
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

export function useOpenServiceConfig() {
  return useMutation({
    meta: { quiet: true },
    mutationFn: (name: string) => ipcVoid(CMD.SERVICES_OPEN_CONFIG, { name }),
  });
}
