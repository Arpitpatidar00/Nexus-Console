export const packageKeys = {
  all: ['packages'] as const,
  list: () => ['packages'] as const,
  outdated: () => ['packages', 'outdated'] as const,
  cellar: (name: string) => ['packages', 'cellar', name] as const,
};
