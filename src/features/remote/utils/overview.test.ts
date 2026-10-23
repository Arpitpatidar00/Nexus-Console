import { test, expect } from 'vitest';
import { describeLoad, fullestDisk, level, splitDisks } from './overview';

const GiB = 1024 ** 3;
const disk = (mount: string, totalGiB: number, usedGiB: number) => ({
  mount,
  fs: '/dev/x',
  totalBytes: totalGiB * GiB,
  usedBytes: usedGiB * GiB,
  availBytes: (totalGiB - usedGiB) * GiB,
});

test('boot and firmware partitions are system disks', () => {
  const { main, system } = splitDisks([
    disk('/', 28, 9),
    disk('/boot', 0.86, 0.17),
    disk('/boot/efi', 0.1, 0.01),
    disk('/sys/firmware/efi/efivars', 0.000125, 0),
    disk('/data', 100, 90),
  ]);
  expect(main.map((d) => d.mount)).toEqual(['/', '/data']);
  expect(system.map((d) => d.mount)).toEqual(['/boot', '/boot/efi', '/sys/firmware/efi/efivars']);
});

test('only odd mounts still shows them', () => {
  expect(splitDisks([disk('/boot', 0.5, 0.1)]).main).toHaveLength(1);
});

test('fullest main disk ignores a nearly full /boot/efi', () => {
  const f = fullestDisk([disk('/', 28, 9), disk('/boot/efi', 0.1, 0.099)]);
  expect(f?.disk.mount).toBe('/');
  expect(Math.round(f!.pct)).toBe(32);
});

test('levels and load words', () => {
  expect(level(null, 80, 90)).toBe('none');
  expect(level(85, 80, 90)).toBe('warn');
  expect(level(95, 80, 90)).toBe('crit');
  expect(describeLoad(0.18, 2)).toEqual({ text: 'Idle', level: 'ok' });
  expect(describeLoad(1.8, 2)).toEqual({ text: 'Busy', level: 'warn' });
  expect(describeLoad(4, 2)).toEqual({ text: 'Overloaded', level: 'crit' });
});
