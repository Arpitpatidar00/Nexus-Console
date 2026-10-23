export const macleanKeys = {
  report: () => ['maclean', 'report'] as const,
  rules: () => ['maclean', 'rules'] as const,
  journal: () => ['maclean', 'journal'] as const,
  ghosts: () => ['maclean', 'ghosts'] as const,
  projects: () => ['maclean', 'projects'] as const,
  appData: () => ['maclean', 'appData'] as const,
  energy: () => ['maclean', 'energy'] as const,
  paused: () => ['maclean', 'paused'] as const,
  trends: () => ['maclean', 'trends'] as const,
  duplicates: (dirs?: string[]) => ['maclean', 'duplicates', dirs] as const,
};
