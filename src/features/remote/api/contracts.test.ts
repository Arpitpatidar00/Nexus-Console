import { expect, test } from 'vitest';
import type { z } from 'zod';
import contracts from '../../../../fixtures/remote/contracts.json';
import {
  containerLogsSchema,
  hostHistoryDtoSchema,
  hostNoteSchema,
  inspectionDataSchema,
  pruneResultSchema,
  remoteFileContentSchema,
  remoteFileEntrySchema,
  serverDiskReportSchema,
} from './remote.schema';

// contracts.json is written by Rust (`dto_contracts_golden` in
// src-tauri/src/commands/remote.rs). zod drops keys it doesn't know, so
// equality also catches a field Rust sends that the schema never declared.
const cases: [string, z.ZodType, unknown][] = [
  ['history', hostHistoryDtoSchema, contracts.history],
  ['inspection', inspectionDataSchema, contracts.inspection],
  ['diskReport', serverDiskReportSchema, contracts.diskReport],
  ['pruneResult', pruneResultSchema, contracts.pruneResult],
  ['fileEntry', remoteFileEntrySchema, contracts.fileEntry],
  ['fileContent', remoteFileContentSchema, contracts.fileContent],
  ['containerLogs', containerLogsSchema, contracts.containerLogs],
  ['note', hostNoteSchema, contracts.note],
];

test.each(cases)('%s schema matches the Rust DTO exactly', (_name, schema, payload) => {
  expect(schema.parse(payload)).toEqual(payload);
});
