import { expect, test } from 'vitest';
import contracts from '../../../../fixtures/databases/explorer-contracts.json';
import { browsePageSchema, dbSchemaSchema } from './explorer.schema';

// explorer-contracts.json is written by Rust (`explorer_contracts_golden`).
// zod drops unknown keys, so equality also catches a field only Rust sends.
test.each([
  ['postgres schema', dbSchemaSchema, contracts.postgres],
  ['mysql schema', dbSchemaSchema, contracts.mysql],
  ['browse page', browsePageSchema, contracts.browsePage],
] as const)('%s matches the Rust DTO exactly', (_name, schema, payload) => {
  expect(schema.parse(payload)).toEqual(payload);
});
