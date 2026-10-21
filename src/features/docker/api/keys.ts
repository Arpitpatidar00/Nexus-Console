export const dockerKeys = {
  all: ['docker'] as const,
  runtime: () => [...dockerKeys.all, 'runtime'] as const,
  containers: () => [...dockerKeys.all, 'containers'] as const,
};
