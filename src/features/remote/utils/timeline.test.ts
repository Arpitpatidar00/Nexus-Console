import { test, expect } from 'vitest';
import contracts from '../../../../fixtures/remote/contracts.json';
import { hostHistoryDtoSchema } from '@/features/remote/api/remote.schema';
import { changesOf, formatSpan, humanizeId } from './timeline';

test('a real diff reads as sentences, worst first', () => {
  const { latestDiff } = hostHistoryDtoSchema.parse(contracts.history);
  const changes = changesOf(latestDiff);
  expect(changes[0]).toEqual({ tone: 'danger', text: 'New critical issue: Disk full' });
  expect(changes.map((c) => c.text)).toEqual([
    'New critical issue: Disk full',
    'Service failed',
    'Container gone',
    'Container restarted',
    'Disk usage grew 7 points',
    'web now runs a new image',
    'New container',
  ]);
  expect(changes.find((c) => c.text === 'Container gone')?.subject).toBe('api');
});

test('no diff yet is no changes', () => {
  expect(changesOf(null)).toEqual([]);
});

test('ids and spans read naturally', () => {
  expect(humanizeId('docker_no_permission')).toBe('Docker no permission');
  expect(formatSpan(42)).toBe('42 s');
  expect(formatSpan(300)).toBe('5 min');
  expect(formatSpan(7_500)).toBe('2 h 5 min');
  expect(formatSpan(3 * 86_400)).toBe('3 days');
});
