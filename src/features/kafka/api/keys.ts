export const kafkaKeys = {
  all: ['kafka'] as const,
  clusters: () => [...kafkaKeys.all, 'clusters'] as const,
  cluster: (id: string) => [...kafkaKeys.all, 'cluster', id] as const,
  ping: (id: string) => [...kafkaKeys.cluster(id), 'ping'] as const,
  overview: (id: string) => [...kafkaKeys.cluster(id), 'overview'] as const,
  topics: (id: string) => [...kafkaKeys.cluster(id), 'topics'] as const,
  topic: (id: string, topic: string) => [...kafkaKeys.cluster(id), 'topic', topic] as const,
  groups: (id: string) => [...kafkaKeys.cluster(id), 'groups'] as const,
  group: (id: string, group: string) => [...kafkaKeys.cluster(id), 'group', group] as const,
  brokerConfigs: (id: string, broker: number) =>
    [...kafkaKeys.cluster(id), 'brokerConfigs', broker] as const,
};
