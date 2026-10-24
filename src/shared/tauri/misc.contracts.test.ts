import { expect, test } from 'vitest';
import contracts from '../../../fixtures/contracts/misc-contracts.json';
import {
  processBandwidthSchema,
  networkInfoSchema,
  chaosProfileSchema,
  chaosProxyInfoSchema,
} from '@/features/network/api/network.schema';
import {
  ec2InstanceSchema,
  s3BucketSchema,
  awsCostReportSchema,
} from '@/features/cloud/api/cloud.schema';
import { backupRecordSchema, backupConfigSchema } from '@/features/backups/api/backups.schema';

// misc-contracts.json is written by Rust (`services::network::golden_contract::
// misc_contracts_golden`) from the real DTOs behind network, chaos, cloud and
// backups commands. zod drops unknown keys, so equality also catches a field
// only Rust sends — see AUDIT-2026-10-24 ARC-01 / TST-01.
test.each([
  ['process bandwidth', processBandwidthSchema, contracts.processBandwidth],
  ['network info', networkInfoSchema, contracts.networkInfo],
  ['chaos profile', chaosProfileSchema, contracts.chaosProfile],
  ['chaos proxy info', chaosProxyInfoSchema, contracts.chaosProxyInfo],
  ['ec2 instance', ec2InstanceSchema, contracts.ec2Instance],
  ['s3 bucket', s3BucketSchema, contracts.s3Bucket],
  ['aws cost report', awsCostReportSchema, contracts.awsCostReport],
  ['backup record', backupRecordSchema, contracts.backupRecord],
  ['backup config', backupConfigSchema, contracts.backupConfig],
] as const)('%s matches the Rust DTO exactly', (_name, schema, payload) => {
  expect(schema.parse(payload)).toEqual(payload);
});
