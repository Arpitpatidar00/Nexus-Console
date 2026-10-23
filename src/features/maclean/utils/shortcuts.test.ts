import { test, expect } from 'vitest';
import contracts from '../../../../fixtures/maclean/storage-contracts.json';
import {
  appDataReportSchema,
  projectsReportSchema,
} from '@/features/maclean/api/storageTools.schema';
import type { DuplicateGroup } from '@/features/maclean/api/maclean.schema';
import {
  appDataSelection,
  artifactSelection,
  downloadsCopies,
  duplicateBytes,
  duplicateSelection,
  keeperOf,
  looksLikeCopy,
} from './shortcuts';

const H = '/Users/me';
const group = (sizeBytes: number, files: [string, number][]): DuplicateGroup => ({
  hash: files[0][0],
  sizeBytes,
  files: files.map(([path, modifiedAt]) => ({ path, sizeBytes, modifiedAt })),
});

const groups = [
  // The real file is in Documents; Downloads has two re-downloads.
  group(1000, [
    [`${H}/Downloads/invoice (1).pdf`, 300],
    [`${H}/Documents/Taxes/invoice.pdf`, 100],
    [`${H}/Downloads/invoice.pdf`, 200],
  ]),
  // Both in Downloads: never select both.
  group(500, [
    [`${H}/Downloads/photo.jpg`, 10],
    [`${H}/Downloads/photo copy.jpg`, 20],
  ]),
];

test('copy-looking names', () => {
  expect(looksLikeCopy('/x/report (1).pdf')).toBe(true);
  expect(looksLikeCopy('/x/report copy.pdf')).toBe(true);
  expect(looksLikeCopy('/x/report copy 2.pdf')).toBe(true);
  expect(looksLikeCopy('/x/report-1.pdf')).toBe(true);
  expect(looksLikeCopy('/x/report.pdf')).toBe(false);
  expect(looksLikeCopy('/x/2024-annual.pdf')).toBe(false);
});

test('smart pick keeps the original outside Downloads', () => {
  expect(keeperOf(groups[0].files, 'smart').path).toBe(`${H}/Documents/Taxes/invoice.pdf`);
  // All in Downloads: the one without "copy" in its name stays.
  expect(keeperOf(groups[1].files, 'smart').path).toBe(`${H}/Downloads/photo.jpg`);
  const sel = duplicateSelection(groups, 'smart');
  expect([...sel].sort()).toEqual([
    `${H}/Downloads/invoice (1).pdf`,
    `${H}/Downloads/invoice.pdf`,
    `${H}/Downloads/photo copy.jpg`,
  ]);
  expect(duplicateBytes(groups, sel)).toBe(2500);
});

test('newest / oldest keep exactly one per group', () => {
  for (const how of ['newest', 'oldest', 'outsideDownloads'] as const) {
    const sel = duplicateSelection(groups, how);
    for (const g of groups) expect(g.files.filter((f) => !sel.has(f.path))).toHaveLength(1);
  }
  expect(keeperOf(groups[0].files, 'newest').modifiedAt).toBe(300);
  expect(keeperOf(groups[0].files, 'oldest').modifiedAt).toBe(100);
});

test('Downloads copies only, never a whole group', () => {
  const sel = downloadsCopies(groups);
  expect(sel.has(`${H}/Downloads/invoice (1).pdf`) && sel.has(`${H}/Downloads/invoice.pdf`)).toBe(
    true,
  );
  expect(sel.has(`${H}/Documents/Taxes/invoice.pdf`)).toBe(false);
  expect(groups[1].files.filter((f) => !sel.has(f.path))).toHaveLength(1);
});

test('project and app-data shortcuts respect protection and open apps', () => {
  const r = projectsReportSchema.parse(contracts.projects);
  // The protected project's .next never appears.
  expect([...artifactSelection(r, 'everything')]).toEqual(['/Users/me/Desktop/web/node_modules']);
  expect([...artifactSelection(r, 'dependencies')]).toEqual(['/Users/me/Desktop/web/node_modules']);
  expect(artifactSelection(r, 'buildOutput').size).toBe(0);
  const a = appDataReportSchema.parse(contracts.appData);
  // Slack is open in the fixture.
  expect(appDataSelection(a, 'caches').size).toBe(0);
  expect([...appDataSelection(a, 'backups')]).toEqual(['/Users/me/.gemini/tasks/c_1/backup']);
});
