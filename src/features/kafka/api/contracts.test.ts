import { expect, test } from 'vitest';
import contracts from '../../../../fixtures/kafka/contracts.json';
import {
  clusterOverviewSchema,
  consumeResultSchema,
  groupDetailSchema,
  groupListSchema,
  kafkaClusterSchema,
  kafkaTestResultSchema,
  payloadSchema,
  topicDetailSchema,
  topicListSchema,
} from './kafka.schema';

// contracts.json is written by Rust (`kafka_contracts_golden`).
// zod drops unknown keys, so equality also catches a field only Rust sends.
test.each([
  ['cluster', kafkaClusterSchema, contracts.cluster],
  ['test result', kafkaTestResultSchema, contracts.test],
  ['overview', clusterOverviewSchema, contracts.overview],
  ['topic list', topicListSchema, contracts.topics],
  ['topic detail', topicDetailSchema, contracts.topicDetail],
  ['group list', groupListSchema, contracts.groups],
  ['group detail', groupDetailSchema, contracts.groupDetail],
  ['consume result', consumeResultSchema, contracts.consume],
  ['json payload', payloadSchema, contracts.jsonPayload],
] as const)('%s matches the Rust DTO exactly', (_name, schema, payload) => {
  expect(schema.parse(payload)).toEqual(payload);
});
