import { useQuery } from '@tanstack/react-query';
import { ipc, CMD } from '@/shared/tauri';
import { remoteKeys } from './keys';
import { parityReportSchema, type ParityReport, type ParityAuditInput } from './remote.schema';

export function useParityAudit(input: ParityAuditInput, enabled: boolean) {
  return useQuery<ParityReport>({
    queryKey: [...remoteKeys.parity(input.localProjectPath ?? undefined), ...input.hostIds],
    queryFn: () => ipc(CMD.REMOTE_AUDIT_PARITY, { input }, parityReportSchema),
    enabled: enabled && input.hostIds.length > 0,
    staleTime: 30_000,
  });
}
