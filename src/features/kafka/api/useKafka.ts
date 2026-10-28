import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, ipcVoid, CMD } from '@/shared/tauri';
import { kafkaKeys } from './keys';
import {
  clusterOverviewSchema,
  configEntrySchema,
  consumeResultSchema,
  groupDetailSchema,
  groupListSchema,
  kafkaClusterSchema,
  kafkaTestResultSchema,
  topicDetailSchema,
  topicListSchema,
  type ClusterInput,
  type ConsumeRequest,
} from './kafka.schema';

// Every read below reaches a broker over the network, so they are cached
// longer than the app's 2s default and never retried more than once.
const CLUSTER_STALE = 15_000;

export function useKafkaClusters() {
  return useQuery({
    queryKey: kafkaKeys.clusters(),
    queryFn: () => ipc(CMD.KAFKA_LIST_CLUSTERS, undefined, z.array(kafkaClusterSchema)),
    staleTime: Infinity,
  });
}

export function useSaveKafkaCluster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ClusterInput) =>
      ipc(
        input.id ? CMD.KAFKA_UPDATE_CLUSTER : CMD.KAFKA_ADD_CLUSTER,
        { input },
        kafkaClusterSchema,
      ),
    onSuccess: (cluster) => {
      queryClient.invalidateQueries({ queryKey: kafkaKeys.clusters() });
      // New address or credentials: nothing cached for it still holds.
      queryClient.removeQueries({ queryKey: kafkaKeys.cluster(cluster.id) });
    },
  });
}

export function useRemoveKafkaCluster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ipcVoid(CMD.KAFKA_REMOVE_CLUSTER, { id }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: kafkaKeys.clusters() });
      queryClient.removeQueries({ queryKey: kafkaKeys.cluster(id) });
    },
  });
}

/** Tries form values without saving; a failure is a result, not an error. */
export function useTestKafkaConnection() {
  return useMutation({
    mutationFn: (input: ClusterInput) =>
      ipc(CMD.KAFKA_TEST_CONNECTION, { input }, kafkaTestResultSchema),
  });
}

export function useKafkaPing(id: string | null) {
  return useQuery({
    queryKey: kafkaKeys.ping(id ?? ''),
    queryFn: () => ipc(CMD.KAFKA_PING, { id }, kafkaTestResultSchema),
    enabled: Boolean(id),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useKafkaOverview(id: string | null) {
  return useQuery({
    queryKey: kafkaKeys.overview(id ?? ''),
    queryFn: () => ipc(CMD.KAFKA_OVERVIEW, { id }, clusterOverviewSchema),
    enabled: Boolean(id),
    staleTime: CLUSTER_STALE,
  });
}

export function useKafkaTopics(id: string | null) {
  return useQuery({
    queryKey: kafkaKeys.topics(id ?? ''),
    queryFn: () => ipc(CMD.KAFKA_TOPICS, { id }, topicListSchema),
    enabled: Boolean(id),
    staleTime: CLUSTER_STALE,
  });
}

export function useKafkaTopicDetail(id: string, topic: string) {
  return useQuery({
    queryKey: kafkaKeys.topic(id, topic),
    queryFn: () => ipc(CMD.KAFKA_TOPIC_DETAIL, { id, topic }, topicDetailSchema),
    staleTime: CLUSTER_STALE,
  });
}

export function useKafkaGroups(id: string | null, live = false) {
  return useQuery({
    queryKey: kafkaKeys.groups(id ?? ''),
    queryFn: () => ipc(CMD.KAFKA_GROUPS, { id }, groupListSchema),
    enabled: Boolean(id),
    staleTime: CLUSTER_STALE,
    refetchInterval: live ? 10_000 : false,
  });
}

export function useKafkaGroupDetail(id: string, group: string, live = false) {
  return useQuery({
    queryKey: kafkaKeys.group(id, group),
    queryFn: () => ipc(CMD.KAFKA_GROUP_DETAIL, { id, group }, groupDetailSchema),
    staleTime: 5_000,
    refetchInterval: live ? 5_000 : false,
  });
}

export function useKafkaBrokerConfigs(id: string, broker: number | null) {
  return useQuery({
    queryKey: kafkaKeys.brokerConfigs(id, broker ?? -1),
    queryFn: () => ipc(CMD.KAFKA_BROKER_CONFIGS, { id, broker }, z.array(configEntrySchema)),
    enabled: broker !== null,
    staleTime: 60_000,
  });
}

/** One browse per click: `run` is bumped to re-read with the same settings. */
export function useKafkaConsume(id: string, request: ConsumeRequest | null, run: number) {
  return useQuery({
    queryKey: [...kafkaKeys.cluster(id), 'consume', request, run] as const,
    queryFn: () => ipc(CMD.KAFKA_CONSUME, { id, request }, consumeResultSchema),
    enabled: request !== null,
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });
}
