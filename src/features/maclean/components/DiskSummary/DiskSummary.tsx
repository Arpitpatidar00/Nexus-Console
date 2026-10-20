import { formatBytes, formatRelative } from '@/shared/lib/format';
import { diskTone, pct } from '@/features/maclean/utils/storage';
import { UsageBar } from '@/features/maclean/components/UsageBar';
import type { DiskSummaryProps } from './DiskSummary.types';

const TONE_TEXT = { ok: 'text-success', warn: 'text-warning', danger: 'text-destructive' } as const;

export const DiskSummary = ({ disk, lastClean }: DiskSummaryProps) => {
  const used = pct(disk.usedBytes, disk.totalBytes);
  const tone = diskTone(used);
  return (
    <section className="rounded-xl px-5 py-4 text-card-foreground shadow-edge glass">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold text-foreground">Macintosh HD</h2>
          <span className="font-mono text-sm text-muted-foreground tabular-nums">
            {formatBytes(disk.usedBytes)} used of {formatBytes(disk.totalBytes)}
          </span>
        </div>
        <span className={`font-mono text-sm font-semibold tabular-nums ${TONE_TEXT[tone]}`}>
          {formatBytes(disk.freeBytes)} free · {Math.round(used)}% used
        </span>
      </div>
      <UsageBar pct={used} tone={tone} className="mt-3 h-2" />
      {lastClean && (
        <p className="mt-2 font-mono text-xs text-muted-foreground tabular-nums">
          Last cleaned {formatRelative(lastClean.atEpoch * 1000)} · freed{' '}
          {formatBytes(lastClean.freedBytes)}
        </p>
      )}
    </section>
  );
};
