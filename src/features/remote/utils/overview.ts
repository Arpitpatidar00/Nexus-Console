import type { HostSnapshot } from '@/features/remote/api/remote.schema';
import { usedPct } from './health';

type Disk = HostSnapshot['disks'][number];

export type Level = 'ok' | 'warn' | 'crit' | 'none';

export const level = (pct: number | null, warnAt: number, critAt: number): Level =>
  pct == null ? 'none' : pct >= critAt ? 'crit' : pct >= warnAt ? 'warn' : 'ok';

const GIB = 1024 ** 3;
const SYSTEM_MOUNT = /^\/(boot|sys|snap|run|dev|proc)(\/|$)/;

/** Where apps and data live, versus firmware/boot partitions nobody fills by
 * hand. Tiny filesystems (< 1 GiB) are system ones too. */
export function splitDisks(disks: Disk[]): { main: Disk[]; system: Disk[] } {
  const isSystem = (d: Disk) => SYSTEM_MOUNT.test(d.mount) || d.totalBytes < GIB;
  const main = disks.filter((d) => !isSystem(d));
  // Never hide everything: a box with only odd mounts still shows them.
  return main.length > 0 ? { main, system: disks.filter(isSystem) } : { main: disks, system: [] };
}

/** The fullest main disk: what "is this server running out of space?" means. */
export function fullestDisk(disks: Disk[]): { disk: Disk; pct: number } | null {
  let best: { disk: Disk; pct: number } | null = null;
  for (const disk of splitDisks(disks).main) {
    const pct = usedPct(disk.usedBytes, disk.availBytes);
    if (!best || pct > best.pct) best = { disk, pct };
  }
  return best;
}

/** Load average per core as a sentence: 1.0 per core = every core busy. */
export function describeLoad(load: number, cores: number): { text: string; level: Level } {
  if (cores <= 0) return { text: 'Unknown', level: 'none' };
  const perCore = load / cores;
  if (perCore < 0.3) return { text: 'Idle', level: 'ok' };
  if (perCore < 0.7) return { text: 'Light', level: 'ok' };
  if (perCore < 1) return { text: 'Busy', level: 'warn' };
  return { text: 'Overloaded', level: perCore >= 1.5 ? 'crit' : 'warn' };
}
