export const dbKeys = {
  all: ['databases'] as const,
  discovered: () => [...dbKeys.all, 'discovered'] as const,
  groups: () => [...dbKeys.all, 'groups'] as const,
  connections: () => [...dbKeys.all, 'connections'] as const,
  schema: (id: string) => [...dbKeys.all, 'schema', id] as const,
  browse: (id: string, request: unknown) => [...dbKeys.all, 'browse', id, request] as const,
  snapshots: (dataDir: string) => [...dbKeys.all, 'snapshots', dataDir] as const,
  customMappings: (groupId?: string | null) =>
    [...dbKeys.all, 'customMappings', groupId ?? 'all'] as const,
  rejectedCandidates: (groupId?: string | null) =>
    [...dbKeys.all, 'rejectedCandidates', groupId ?? 'all'] as const,
  ping: (id: string) => [...dbKeys.all, 'ping', id] as const,
};
