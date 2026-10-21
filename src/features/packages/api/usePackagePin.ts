import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, ipcVoid, CMD } from '@/shared/tauri';
import { packageKeys } from './keys';

export function usePackagePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => ipcVoid(CMD.PACKAGE_PIN, { name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: packageKeys.list() });
    },
  });
}

export function usePackageUnpin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => ipcVoid(CMD.PACKAGE_UNPIN, { name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: packageKeys.list() });
    },
  });
}

export function useCellarVersions(name: string, enabled = false) {
  return useQuery({
    queryKey: ['packages', 'cellar', name],
    queryFn: () => ipc(CMD.PACKAGE_CELLAR_VERSIONS, { name }, z.array(z.string())),
    enabled: Boolean(name) && enabled,
    staleTime: 30_000,
  });
}

export function useRollbackPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, version }: { name: string; version: string }) =>
      ipcVoid(CMD.PACKAGE_ROLLBACK, { name, version }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: packageKeys.list() });
    },
  });
}
