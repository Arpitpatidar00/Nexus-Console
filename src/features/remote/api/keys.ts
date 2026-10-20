export const remoteKeys = {
  all: ['remote'] as const,
  state: () => ['remote', 'state'] as const,
  scan: () => ['remote', 'scan'] as const,
  status: () => ['remote', 'status'] as const,
  snapshot: (id: string) => ['remote', 'snapshot', id] as const,
  connect: (id: string) => ['remote', 'connect', id] as const,
  journal: () => ['remote', 'journal'] as const,
  tunnels: () => ['remote', 'tunnels'] as const,
};
