import { formatBytes, formatRelative } from '@/shared/lib/format';
import type { CleanJournal, StorageReport } from '@/features/maclean/api/maclean.schema';
import { diskTone, pct } from '@/features/maclean/utils/storage';
import { UsageBar } from '@/features/maclean/components/UsageBar';

const TONE_TEXT = { ok: 'text-running', warn: 'text-warn', danger: 'text-danger' } as const;

export const DiskSummary = ({
  disk,
  lastClean,
}: {
  disk: StorageReport['disk'];
  lastClean?: CleanJournal[number];
}) => {
  const used = pct(disk.usedBytes, disk.totalBytes);
  const tone = diskTone(used);
  return (
    <section className="rounded-xl border border-border bg-paper px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold text-fg">Macintosh HD</h2>
          <span className="text-sm text-fg-muted tabular-nums">
            {formatBytes(disk.usedBytes)} used of {formatBytes(disk.totalBytes)}
          </span>
        </div>
        <span className={`text-sm font-semibold tabular-nums ${TONE_TEXT[tone]}`}>
          {formatBytes(disk.freeBytes)} free · {Math.round(used)}% used
        </span>
      </div>
      <UsageBar pct={used} tone={tone} className="mt-3 h-2" />
      {lastClean && (
        <p className="mt-2 text-xs text-fg-subtle tabular-nums">
          Last cleaned {formatRelative(lastClean.atEpoch * 1000)} · freed{' '}
          {formatBytes(lastClean.freedBytes)}
        </p>
      )}
    </section>
  );
};
