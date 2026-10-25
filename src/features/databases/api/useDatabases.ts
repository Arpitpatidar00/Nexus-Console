import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, ipcVoid, CMD } from '@/shared/tauri';
import { dbKeys } from './keys';
import {
  discoveredDbSchema,
  dbConnectionSchema,
  dbGroupSchema,
  queryResultSchema,
  dbSnapshotSchema,
  dbCustomMappingSchema,
  dbRejectedCandidateSchema,
  dbPingResultSchema,
  type DiscoveredDb,
  type DbConnection,
  type DbGroup,
  type CreateGroupInput,
  type UpdateGroupInput,
  type UpdateConnectionInput,
  type QueryResult,
  type DbSnapshot,
  type DbCustomMapping,
  type DbRejectedCandidate,
  type SaveCustomMappingInput,
  type DbPingResult,
} from './databases.schema';

export function useDiscoveredDatabases() {
  return useQuery<DiscoveredDb[]>({
    queryKey: dbKeys.discovered(),
    queryFn: () => ipc(CMD.DB_DISCOVER_CONNECTIONS, undefined, z.array(discoveredDbSchema)),
    staleTime: 10_000,
  });
}

export function useDbGroups() {
  return useQuery<DbGroup[]>({
    queryKey: dbKeys.groups(),
    queryFn: () => ipc(CMD.DB_LIST_GROUPS, undefined, z.array(dbGroupSchema)),
    staleTime: Infinity,
  });
}

export function useCreateDbGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGroupInput) => ipc(CMD.DB_CREATE_GROUP, { input }, dbGroupSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dbKeys.groups() });
    },
  });
}

export function useUpdateDbGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateGroupInput) => ipc(CMD.DB_UPDATE_GROUP, { input }, dbGroupSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dbKeys.groups() });
    },
  });
}

export function useDeleteDbGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, deleteConnections }: { id: string; deleteConnections: boolean }) =>
      ipcVoid(CMD.DB_DELETE_GROUP, { id, deleteConnections }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dbKeys.groups() });
      queryClient.invalidateQueries({ queryKey: dbKeys.connections() });
    },
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
      groupId?: string | null;
    }) => ipc(CMD.DB_ADD_CONNECTION, { input }, dbConnectionSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dbKeys.connections() });
    },
  });
}

export function useUpdateDbConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateConnectionInput) =>
      ipc(CMD.DB_UPDATE_CONNECTION, { input }, dbConnectionSchema),
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: dbKeys.connections() });
      queryClient.removeQueries({ queryKey: [...dbKeys.all, 'schema', input.id] });
      queryClient.removeQueries({ queryKey: [...dbKeys.all, 'browse', input.id] });
    },
  });
}

export function useMoveDbConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, groupId }: { id: string; groupId: string | null }) =>
      ipc(CMD.DB_MOVE_CONNECTION, { id, groupId }, dbConnectionSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dbKeys.connections() });
    },
  });
}

export function useRemoveDbConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ipcVoid(CMD.DB_REMOVE_CONNECTION, { id }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: dbKeys.connections() });
      queryClient.removeQueries({ queryKey: [...dbKeys.all, 'schema', id] });
      queryClient.removeQueries({ queryKey: [...dbKeys.all, 'browse', id] });
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

export function useDbCustomMappings(groupId?: string | null) {
  return useQuery<DbCustomMapping[]>({
    queryKey: dbKeys.customMappings(groupId),
    queryFn: () =>
      ipc(
        CMD.DB_LIST_CUSTOM_MAPPINGS,
        { groupId: groupId ?? null },
        z.array(dbCustomMappingSchema),
      ),
  });
}

export function useSaveDbCustomMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mapping: SaveCustomMappingInput) =>
      ipc(CMD.DB_SAVE_CUSTOM_MAPPING, { mapping }, dbCustomMappingSchema),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: dbKeys.customMappings(saved.groupId) });
      queryClient.invalidateQueries({ queryKey: dbKeys.customMappings() });
    },
  });
}

export function useDeleteDbCustomMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; groupId?: string | null }) =>
      ipcVoid(CMD.DB_DELETE_CUSTOM_MAPPING, { id: vars.id }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: dbKeys.customMappings(vars.groupId) });
      queryClient.invalidateQueries({ queryKey: dbKeys.customMappings() });
    },
  });
}

export function useDbRejectedCandidates(groupId?: string | null) {
  return useQuery<DbRejectedCandidate[]>({
    queryKey: dbKeys.rejectedCandidates(groupId),
    queryFn: () =>
      ipc(
        CMD.DB_LIST_REJECTED_CANDIDATES,
        { groupId: groupId ?? null },
        z.array(dbRejectedCandidateSchema),
      ),
  });
}

export function useRejectDbCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rejected: Omit<DbRejectedCandidate, 'createdAt'> & { createdAt?: number }) =>
      ipc(CMD.DB_REJECT_CANDIDATE, { rejected }, dbRejectedCandidateSchema),
    onSuccess: (rej) => {
      queryClient.invalidateQueries({ queryKey: dbKeys.rejectedCandidates(rej.groupId) });
      queryClient.invalidateQueries({ queryKey: dbKeys.rejectedCandidates() });
    },
  });
}

export function useUnrejectDbCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; groupId?: string | null }) =>
      ipcVoid(CMD.DB_UNREJECT_CANDIDATE, { id: vars.id }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: dbKeys.rejectedCandidates(vars.groupId) });
      queryClient.invalidateQueries({ queryKey: dbKeys.rejectedCandidates() });
    },
  });
}

export function useDbPing(id: string | null) {
  return useQuery<DbPingResult>({
    queryKey: dbKeys.ping(id ?? ''),
    queryFn: () => ipc(CMD.DB_PING, { id: id! }, dbPingResultSchema),
    enabled: Boolean(id),
    staleTime: 30_000,
    retry: false,
  });
}

export function useDbPingMutation() {
  return useMutation({
    mutationFn: (id: string) => ipc(CMD.DB_PING, { id }, dbPingResultSchema),
  });
}
