import { useQuery } from '@tanstack/react-query';
import { ipc, CMD } from '@/shared/tauri';
import { remoteKeys } from './keys';
import { inspectionDataSchema, type InspectionData } from './remote.schema';

export function useServerInspection(hostId: string, enabled: boolean) {
  return useQuery<InspectionData>({
    queryKey: remoteKeys.inspection(hostId),
    queryFn: () => ipc(CMD.REMOTE_INSPECT_SERVICES, { id: hostId }, inspectionDataSchema),
    enabled,
    staleTime: 30_000,
  });
}
