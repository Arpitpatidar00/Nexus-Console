export const projectKeys = {
  all: ['projects'] as const,
  discover: () => [...projectKeys.all, 'discover'] as const,
  workspaces: () => [...projectKeys.all, 'workspaces'] as const,
  github: (path: string) => [...projectKeys.all, 'github', path] as const,
  savedCommands: (path: string) => [...projectKeys.all, 'commands', path] as const,
};
