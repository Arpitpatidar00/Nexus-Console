import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, CMD } from '@/shared/tauri';
import {
  secretFindingSchema,
  secretsScanResultSchema,
  type SecretsScanResult,
  type SecretFinding,
} from './secrets.schema';

export function useScanProjectsSecrets() {
  return useMutation({
    mutationFn: (paths?: string[]) =>
      ipc<SecretsScanResult>(
        CMD.SECRETS_SCAN_PROJECTS,
        { paths: paths ?? null },
        secretsScanResultSchema,
      ),
  });
}

export function useScanHistorySecrets() {
  return useMutation({
    mutationFn: () =>
      ipc<SecretFinding[]>(CMD.SECRETS_SCAN_HISTORY, undefined, z.array(secretFindingSchema)),
  });
}
