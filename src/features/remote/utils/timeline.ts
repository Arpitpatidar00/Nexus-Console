import type { SnapshotDiff } from '@/features/remote/api/remote.schema';

export type ChangeTone = 'success' | 'warning' | 'danger' | 'info';

export interface Change {
  tone: ChangeTone;
  /** Plain sentence, e.g. "web restarted". */
  text: string;
  /** The exact thing it's about, shown monospace (container, unit, image). */
  subject?: string;
}

/** `disk_full` → `Disk full`: finding ids are the only incident title Rust keeps. */
export const humanizeId = (id: string) =>
  id.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** A diff as sentences, worst news first. */
export function changesOf(d: SnapshotDiff | null): Change[] {
  if (!d) return [];
  return [
    ...d.newFindings.map((f) => ({
      tone: 'danger' as const,
      text: `New critical issue: ${humanizeId(f)}`,
    })),
    ...d.newFailedUnits.map((u) => ({
      tone: 'danger' as const,
      text: 'Service failed',
      subject: u,
    })),
    ...d.removedContainers.map((c) => ({
      tone: 'warning' as const,
      text: 'Container gone',
      subject: c,
    })),
    ...d.restartedContainers.map((c) => ({
      tone: 'warning' as const,
      text: 'Container restarted',
      subject: c,
    })),
    ...(d.diskGrowthPct != null
      ? [{ tone: 'warning' as const, text: `Disk usage grew ${d.diskGrowthPct} points` }]
      : []),
    ...d.changedImages.map(([c, from, to]) => ({
      tone: 'info' as const,
      text: `${c} now runs a new image`,
      subject: `${from} → ${to}`,
    })),
    ...d.addedContainers.map((c) => ({ tone: 'info' as const, text: 'New container', subject: c })),
    ...d.resolvedFailedUnits.map((u) => ({
      tone: 'success' as const,
      text: 'Service recovered',
      subject: u,
    })),
    ...d.resolvedFindings.map((f) => ({
      tone: 'success' as const,
      text: `Resolved: ${humanizeId(f)}`,
    })),
  ];
}

/** "4 min", "2 h 5 min", "3 days" — how long something lasted. */
export function formatSpan(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const days = Math.floor(h / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}
