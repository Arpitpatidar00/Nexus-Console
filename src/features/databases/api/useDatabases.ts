import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, ipcVoid, CMD } from '@/shared/tauri';
import { dbKeys } from './keys';
import {
  discoveredDbSchema,
  dbConnectionSchema,
  queryResultSchema,
  dbSnapshotSchema,
  type DiscoveredDb,
  type DbConnection,
  type QueryResult,
  type DbSnapshot,
} from './databases.schema';

export function useDiscoveredDatabases() {
  return useQuery<DiscoveredDb[]>({
    queryKey: dbKeys.discovered(),
    queryFn: () => ipc(CMD.DB_DISCOVER_CONNECTIONS, undefined, z.array(discoveredDbSchema)),
    staleTime: 10_000,
  });
}

export function useDbConnections() {
  return useQuery<DbConnection[]>({
    queryKey: dbKeys.connections(),
    queryFn: () => ipc(CMD.DB_LIST_CONNECTIONS, undefined, z.array(dbConnectionSchema)),
    staleTime: Infinity,
  });
}

export function useAddDbConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      driver: string;
      host: string;
      port: number;
      user?: string | null;
      password?: string | null;
      database?: string | null;
      tunnelId?: string | null;
      allowWrites: boolean;
      env: string;
      dataDir?: string | null;
    }) => ipc(CMD.DB_ADD_CONNECTION, { input }, dbConnectionSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dbKeys.connections() });
    },
  });
}

export function useRemoveDbConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ipcVoid(CMD.DB_REMOVE_CONNECTION, { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dbKeys.connections() });
    },
  });
}

export function useRunQuery() {
  return useMutation<QueryResult, Error, { id: string; query: string }>({
    mutationFn: (params) => ipc(CMD.DB_RUN_QUERY, params, queryResultSchema),
  });
}

export function useDbSnapshots(dataDir: string | null) {
  return useQuery<DbSnapshot[]>({
    queryKey: dbKeys.snapshots(dataDir ?? ''),
    queryFn: () => ipc(CMD.DB_LIST_SNAPSHOTS, { dataDir: dataDir! }, z.array(dbSnapshotSchema)),
    enabled: Boolean(dataDir),
    refetchInterval: 10_000,
  });
}

export function useCreateDbSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { serviceName?: string | null; dataDir: string; label: string }) =>
      ipc(CMD.DB_CREATE_SNAPSHOT, params, dbSnapshotSchema),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: dbKeys.snapshots(vars.dataDir) });
    },
  });
}

export function useRestoreDbSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { serviceName?: string | null; dataDir: string; snapshotPath: string }) =>
      ipcVoid(CMD.DB_RESTORE_SNAPSHOT, params),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: dbKeys.snapshots(vars.dataDir) });
    },
  });
}
