export const dbKeys = {
  all: ['databases'] as const,
  discovered: () => [...dbKeys.all, 'discovered'] as const,
  connections: () => [...dbKeys.all, 'connections'] as const,
  schema: (id: string) => [...dbKeys.all, 'schema', id] as const,
  snapshots: (dataDir: string) => [...dbKeys.all, 'snapshots', dataDir] as const,
};
