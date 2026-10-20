import { cn } from '@/shared/lib/cn';
import { formatBytes } from '@/shared/lib/format';
import { Sparkline } from '@/shared/ui/Sparkline';
import { Card } from '@/features/maclean/components/Card';
import { PRESSURE, SEGMENTS } from './MemoryComposition.config';
import type { MemoryCompositionProps } from './MemoryComposition.types';

export const MemoryComposition = ({ report, history }: MemoryCompositionProps) => {
  const c = report.composition;
  const p = PRESSURE[report.pressure];

  return (
    <Card
      title="Memory"
      aside={
        <span className="flex items-center gap-2 text-xs text-fg-muted">
          <Sparkline values={history.map((h) => h.usedPct)} />
          <span className="tabular-nums">
            {formatBytes(c.usedBytes)} used of {formatBytes(c.totalBytes)}
          </span>
        </span>
      }
    >
      <div className="space-y-4 px-5 py-4">
        <p className="flex items-start gap-2 text-sm">
          <span aria-hidden className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', p.dot)} />
          <span>
            <span className="font-semibold text-fg">Pressure: {p.label}.</span>{' '}
            <span className="text-fg-muted">{p.text}</span>
          </span>
        </p>
        <div aria-hidden className="flex h-3 overflow-hidden rounded-full bg-list">
          {SEGMENTS.map((s) => (
            <div
              key={s.key}
              className={cn('h-full', s.cls)}
              style={{ width: `${c.totalBytes ? (c[s.key] * 100) / c.totalBytes : 0}%` }}
            />
          ))}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 lg:grid-cols-5">
          {SEGMENTS.map((s) => (
            <div key={s.key} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs text-fg-muted">
                <span
                  aria-hidden
                  className={cn('h-2 w-2 shrink-0 rounded-sm border border-border', s.cls)}
                />
                {s.label}
              </dt>
              <dd className="text-sm font-medium text-fg tabular-nums">{formatBytes(c[s.key])}</dd>
              {s.hint && <dd className="text-xs text-fg-subtle">{s.hint}</dd>}
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
};
