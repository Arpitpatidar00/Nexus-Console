import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, ipcVoid, CMD } from '@/shared/tauri';
import { consentRecordSchema, netDestinationSchema, type ConsentSource } from './privacy.schema';

export const privacyKeys = {
  consents: () => ['privacy', 'consents'] as const,
  destinations: () => ['privacy', 'destinations'] as const,
};

export function useConsents() {
  return useQuery({
    queryKey: privacyKeys.consents(),
    queryFn: () => ipc(CMD.CONSENT_GET_ALL, undefined, z.array(consentRecordSchema)),
  });
}

export function useConsentGranted(source: ConsentSource) {
  const q = useConsents();
  return { ...q, granted: q.data?.find((r) => r.source === source)?.granted ?? false };
}

export function useNetDestinations() {
  return useQuery({
    queryKey: privacyKeys.destinations(),
    queryFn: () => ipc(CMD.NET_GET_DECLARED_DESTINATIONS, undefined, z.array(netDestinationSchema)),
    staleTime: Infinity,
  });
}

/** Granting or revoking can change what other modules may read, so every
 * consent-dependent query refetches afterwards. */
function useInvalidateConsentDependents() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: privacyKeys.consents() });
    void qc.invalidateQueries({ queryKey: ['remote', 'state'] });
  };
}

export function useSetConsent() {
  const invalidate = useInvalidateConsentDependents();
  return useMutation({
    mutationFn: ({ source, granted }: { source: ConsentSource; granted: boolean }) =>
      ipc(CMD.CONSENT_SET, { source, granted }, consentRecordSchema),
    onSettled: invalidate,
  });
}

export function useRevokeAllConsents() {
  const invalidate = useInvalidateConsentDependents();
  return useMutation({
    mutationFn: () => ipcVoid(CMD.CONSENT_REVOKE_ALL),
    onSettled: invalidate,
  });
}
