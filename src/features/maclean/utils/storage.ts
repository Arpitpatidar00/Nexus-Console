import type { CleanItem, StorageReport } from '@/features/maclean/api/maclean.schema';

export type Tone = 'ok' | 'warn' | 'danger';

/** The script's disk colours: warn from 75 % used, danger from 90 %. */
export function diskTone(usedPct: number): Tone {
  if (usedPct >= 90) return 'danger';
  if (usedPct >= 75) return 'warn';
  return 'ok';
}

export const pct = (part: number, whole: number) => (whole > 0 ? (part * 100) / whole : 0);

/** What a fresh plan ticks: the item's own default, if it can run and has
 * something in it. */
export function defaultSelection(items: CleanItem[]): Set<string> {
  return new Set(items.filter((i) => i.defaultSelected && !i.skip && i.bytes > 0).map((i) => i.id));
}

export const isCleanable = (i: CleanItem) => !i.skip && i.bytes > 0;

export function selectedTotal(items: CleanItem[], selected: Set<string>): number {
  return items.filter((i) => selected.has(i.id) && isCleanable(i)).reduce((n, i) => n + i.bytes, 0);
}

/** Map rows with a share of used space, for the bars. */
export function mapShares(r: StorageReport) {
  return r.map.map((m) => ({ ...m, share: pct(m.bytes, r.disk.usedBytes) }));
}
