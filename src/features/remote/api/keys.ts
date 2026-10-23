export const remoteKeys = {
  all: ['remote'] as const,
  state: () => ['remote', 'state'] as const,
  scan: () => ['remote', 'scan'] as const,
  status: () => ['remote', 'status'] as const,
  snapshot: (id: string) => ['remote', 'snapshot', id] as const,
  connect: (id: string) => ['remote', 'connect', id] as const,
  journal: () => ['remote', 'journal'] as const,
  tunnels: () => ['remote', 'tunnels'] as const,
  history: (id: string) => ['remote', 'history', id] as const,
  note: (id: string) => ['remote', 'note', id] as const,
  inspection: (id: string) => ['remote', 'inspection', id] as const,
  diskReport: (id: string) => ['remote', 'diskReport', id] as const,
  containerLogs: (id: string, container: string, tail: number) =>
    ['remote', 'containerLogs', id, container, tail] as const,
  files: (id: string, path: string) => ['remote', 'files', id, path] as const,
  fileContent: (id: string, path: string, reveal: boolean) =>
    ['remote', 'fileContent', id, path, reveal] as const,
  runbooks: (hostId?: string, project?: string) =>
    ['remote', 'runbooks', hostId ?? 'all', project ?? 'all'] as const,
  parity: (localPath?: string) => ['remote', 'parity', localPath ?? 'default'] as const,
  deploys: (hostId: string) => ['remote', 'deploys', hostId] as const,
  deployPreview: (hostId: string, project: string) =>
    ['remote', 'deployPreview', hostId, project] as const,
};
