import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, CMD } from '@/shared/tauri';
import { backupRecordSchema, type BackupRecord, type BackupConfig } from './backups.schema';

export const backupKeys = {
  history: () => ['backups', 'history'] as const,
};

export function useBackupHistory() {
  return useQuery<BackupRecord[]>({
    queryKey: backupKeys.history(),
    queryFn: () => ipc(CMD.BACKUP_LIST_HISTORY, {}, z.array(backupRecordSchema)),
    staleTime: 10_000,
  });
}

export function useCreateDbBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: BackupConfig) => ipc(CMD.BACKUP_CREATE_DB, { config }, backupRecordSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backupKeys.history() });
    },
  });
}

export function useBackupEnv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectPath: string) =>
      ipc(CMD.BACKUP_ENV_FILES, { projectPath }, backupRecordSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backupKeys.history() });
    },
  });
}

export function useDeleteBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ipc(CMD.BACKUP_DELETE, { id }, z.array(backupRecordSchema)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backupKeys.history() });
    },
  });
}
