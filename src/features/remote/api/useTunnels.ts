import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, CMD } from '@/shared/tauri';
import { remoteKeys } from './keys';
import { tunnelStatusSchema, type TunnelStatus } from './remote.schema';

const tunnelsListSchema = z.array(tunnelStatusSchema);

export function useTunnels(refetchInterval: number | false = 3000) {
  return useQuery<TunnelStatus[]>({
    queryKey: remoteKeys.tunnels(),
    queryFn: () => ipc(CMD.REMOTE_GET_TUNNELS, {}, tunnelsListSchema),
    refetchInterval,
  });
}
