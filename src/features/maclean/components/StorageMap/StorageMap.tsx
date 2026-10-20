import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatBytes } from '@/shared/lib/format';
import { mapShares } from '@/features/maclean/utils/storage';
import { Card } from '@/features/maclean/components/Card';
import { UsageBar } from '@/features/maclean/components/UsageBar';
import { StorageMapDrilldown } from './StorageMapDrilldown';
import type { StorageMapProps } from './StorageMap.types';

/** Rows Rust can look inside (computed rows like "macOS volumes" can't). */
const DRILLABLE = new Set(['apps', 'desktop', 'downloads', 'library', 'homebrew', 'devtools']);

export const StorageMap = ({ report }: StorageMapProps) => {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Card
      title="Where your storage goes"
      aside={<span className="text-xs text-fg-subtle">Click a row to look inside</span>}
    >
      <ul className="divide-y divide-border">
        {mapShares(report).map((m) => {
          const drillable = DRILLABLE.has(m.id) && m.bytes > 0;
          const expanded = open === m.id;
          const head = (
            <>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span
                  className="flex min-w-0 items-center gap-1 text-fg"
                  title={m.note ?? undefined}
                >
                  {drillable && (
                    <ChevronRight
                      aria-hidden
                      className={cn(
                        'h-3.5 w-3.5 shrink-0 transition-transform',
                        expanded && 'rotate-90',
                      )}
                    />
                  )}
                  <span className="truncate">{m.label}</span>
                </span>
                <span className="shrink-0 text-xs text-fg-muted tabular-nums">
                  {formatBytes(m.bytes)}
                </span>
              </div>
              <UsageBar pct={m.share} />
              {m.note && <p className="text-xs text-fg-subtle">{m.note}</p>}
            </>
          );

          return (
            <li key={m.id} className="space-y-1.5 px-5 py-2.5">
              {drillable ? (
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen((prev) => (prev === m.id ? null : m.id))}
                  className="-mx-2 block w-[calc(100%+1rem)] space-y-1.5 rounded-lg px-2 py-1 text-left transition hover:bg-list focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {head}
                </button>
              ) : (
                head
              )}
              {drillable && expanded && <StorageMapDrilldown id={m.id} parentBytes={m.bytes} />}
            </li>
          );
        })}
      </ul>
    </Card>
  );
};
