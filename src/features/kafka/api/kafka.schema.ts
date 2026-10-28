import { z } from 'zod';

// Mirrors src-tauri/src/services/kafka/{store,explorer,payload}.rs field for
// field; contracts.test.ts parses the Rust-written golden file to prove it.

export const securitySchema = z.enum(['plaintext', 'ssl', 'saslPlaintext', 'saslSsl']);
export type Security = z.infer<typeof securitySchema>;

export const kafkaClusterSchema = z.object({
  id: z.string(),
  name: z.string(),
  bootstrap: z.array(z.string()),
  security: securitySchema,
  saslMechanism: z.string().nullable(),
  username: z.string().nullable(),
  caCertPath: z.string().nullable(),
  env: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  hasPassword: z.boolean(),
});
export type KafkaCluster = z.infer<typeof kafkaClusterSchema>;

export interface ClusterInput {
  id?: string | null;
  name: string;
  bootstrap: string;
  security: Security;
  saslMechanism?: string | null;
  username?: string | null;
  /** `undefined` keeps the saved password, `''` clears it. */
  password?: string;
  caCertPath?: string | null;
  env: string;
}

export const kafkaTestResultSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number(),
  clusterId: z.string().nullable(),
  brokerCount: z.number(),
  topicCount: z.number(),
  error: z.string().nullable(),
  warnings: z.array(z.string()),
});
export type KafkaTestResult = z.infer<typeof kafkaTestResultSchema>;

export const brokerInfoSchema = z.object({
  id: z.number(),
  host: z.string(),
  port: z.number(),
  rack: z.string().nullable(),
  isController: z.boolean(),
  leaderCount: z.number(),
  replicaCount: z.number(),
  sizeBytes: z.number().nullable(),
  diskTotalBytes: z.number().nullable(),
  diskUsableBytes: z.number().nullable(),
  error: z.string().nullable(),
});
export type BrokerInfo = z.infer<typeof brokerInfoSchema>;

export const clusterOverviewSchema = z.object({
  clusterId: z.string().nullable(),
  controllerId: z.number().nullable(),
  brokers: z.array(brokerInfoSchema),
  topicCount: z.number(),
  internalTopicCount: z.number(),
  partitionCount: z.number(),
  underReplicatedPartitions: z.number(),
  offlinePartitions: z.number(),
  nonPreferredLeaders: z.number(),
  features: z.array(z.object({ name: z.string(), level: z.number() })),
  warnings: z.array(z.string()),
});
export type ClusterOverview = z.infer<typeof clusterOverviewSchema>;

export const topicSummarySchema = z.object({
  name: z.string(),
  internal: z.boolean(),
  partitions: z.number(),
  replicationFactor: z.number(),
  underReplicated: z.number(),
  offline: z.number(),
  messages: z.number().nullable(),
  sizeBytes: z.number().nullable(),
  error: z.string().nullable(),
});
export type TopicSummary = z.infer<typeof topicSummarySchema>;

export const topicListSchema = z.object({
  topics: z.array(topicSummarySchema),
  warnings: z.array(z.string()),
});
export type TopicList = z.infer<typeof topicListSchema>;

export const partitionInfoSchema = z.object({
  partition: z.number(),
  leader: z.number().nullable(),
  replicas: z.array(z.number()),
  isr: z.array(z.number()),
  offlineReplicas: z.array(z.number()),
  low: z.number().nullable(),
  high: z.number().nullable(),
  messages: z.number().nullable(),
  sizeBytes: z.number().nullable(),
  error: z.string().nullable(),
});
export type PartitionInfo = z.infer<typeof partitionInfoSchema>;

export const configEntrySchema = z.object({
  name: z.string(),
  value: z.string().nullable(),
  source: z.string(),
  isDefault: z.boolean(),
  readOnly: z.boolean(),
  sensitive: z.boolean(),
  documentation: z.string().nullable(),
});
export type ConfigEntry = z.infer<typeof configEntrySchema>;

export const topicDetailSchema = z.object({
  name: z.string(),
  internal: z.boolean(),
  topicId: z.string().nullable(),
  partitions: z.array(partitionInfoSchema),
  configs: z.array(configEntrySchema),
  configsError: z.string().nullable(),
  warnings: z.array(z.string()),
});
export type TopicDetail = z.infer<typeof topicDetailSchema>;

export const groupSummarySchema = z.object({
  groupId: z.string(),
  state: z.string(),
  protocolType: z.string(),
  groupType: z.string(),
  assignor: z.string().nullable(),
  members: z.number().nullable(),
  coordinator: z.number(),
  topics: z.array(
    z.object({ topic: z.string(), partitions: z.number(), lag: z.number().nullable() }),
  ),
  totalLag: z.number().nullable(),
  error: z.string().nullable(),
});
export type GroupSummary = z.infer<typeof groupSummarySchema>;

export const groupListSchema = z.object({
  groups: z.array(groupSummarySchema),
  warnings: z.array(z.string()),
});
export type GroupList = z.infer<typeof groupListSchema>;

export const groupMemberSchema = z.object({
  memberId: z.string(),
  groupInstanceId: z.string().nullable(),
  clientId: z.string(),
  host: z.string(),
  assignment: z.array(z.object({ topic: z.string(), partitions: z.array(z.number()) })),
});
export type GroupMember = z.infer<typeof groupMemberSchema>;

export const groupOffsetSchema = z.object({
  topic: z.string(),
  partition: z.number(),
  committed: z.number().nullable(),
  logStart: z.number().nullable(),
  logEnd: z.number().nullable(),
  lag: z.number().nullable(),
  memberId: z.string().nullable(),
  clientId: z.string().nullable(),
  host: z.string().nullable(),
  behindLogStart: z.boolean(),
});
export type GroupOffset = z.infer<typeof groupOffsetSchema>;

export const groupDetailSchema = z.object({
  groupId: z.string(),
  state: z.string(),
  protocolType: z.string(),
  assignor: z.string().nullable(),
  coordinator: z.number(),
  members: z.array(groupMemberSchema),
  offsets: z.array(groupOffsetSchema),
  totalLag: z.number().nullable(),
  error: z.string().nullable(),
  warnings: z.array(z.string()),
});
export type GroupDetail = z.infer<typeof groupDetailSchema>;

export const payloadSchema = z.object({
  format: z.enum(['json', 'text', 'binary', 'schemaRegistry']),
  text: z.string(),
  base64: z.boolean(),
  size: z.number(),
  truncated: z.boolean(),
  schemaId: z.number().nullable(),
});
export type Payload = z.infer<typeof payloadSchema>;

export const kafkaMessageSchema = z.object({
  partition: z.number(),
  offset: z.number(),
  timestamp: z.number(),
  timestampType: z.string(),
  key: payloadSchema.nullable(),
  value: payloadSchema.nullable(),
  headers: z.array(z.object({ key: z.string(), value: payloadSchema.nullable() })),
  size: z.number(),
});
export type KafkaMessage = z.infer<typeof kafkaMessageSchema>;

export const consumeResultSchema = z.object({
  messages: z.array(kafkaMessageSchema),
  partitions: z.array(
    z.object({
      partition: z.number(),
      low: z.number().nullable(),
      high: z.number().nullable(),
      start: z.number().nullable(),
      reached: z.number().nullable(),
      error: z.string().nullable(),
    }),
  ),
  scanned: z.number(),
  durationMs: z.number(),
  partial: z.string().nullable(),
  warnings: z.array(z.string()),
});
export type ConsumeResult = z.infer<typeof consumeResultSchema>;

export type StartAt =
  | { kind: 'latest' }
  | { kind: 'earliest' }
  | { kind: 'offset'; offset: number }
  | { kind: 'timestamp'; timestamp: number };

export interface ConsumeRequest {
  topic: string;
  partitions: number[] | null;
  start: StartAt;
  limit: number;
  search: string | null;
}
