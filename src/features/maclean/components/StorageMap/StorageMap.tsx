import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatBytes } from '@/shared/lib/format';
import { Spinner } from '@/shared/ui/Spinner';
import type { StorageReport } from '@/features/maclean/api/maclean.schema';
import { useDrill } from '@/features/maclean/api/macleanMutations';
import { mapShares } from '@/features/maclean/utils/storage';
import { Card } from '@/features/maclean/components/Card';
import { UsageBar } from '@/features/maclean/components/UsageBar';

/** Rows Rust can look inside (computed rows like "macOS volumes" can't). */
const DRILLABLE = new Set(['apps', 'desktop', 'downloads', 'library', 'homebrew', 'devtools']);

const Children = ({ id, parentBytes }: { id: string; parentBytes: number }) => {
  const q = useDrill(id, true);
  if (q.isPending)
    return (
      <p className="flex items-center gap-2 py-1 text-xs text-fg-muted">
        <Spinner className="h-3.5 w-3.5" /> Measuring what’s inside…
      </p>
    );
  if (q.isError)
    return <p className="py-1 text-xs text-danger">Couldn’t look inside this folder.</p>;
  return (
    <ul className="space-y-1.5 border-l border-border pt-1 pl-3">
      {q.data.map((c) => (
        <li key={c.name} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-fg">{c.name}</span>
            <span className="shrink-0 text-fg-muted tabular-nums">{formatBytes(c.bytes)}</span>
          </div>
          <UsageBar pct={parentBytes > 0 ? (c.bytes * 100) / parentBytes : 0} className="h-1" />
        </li>
      ))}
    </ul>
  );
};

export const StorageMap = ({ report }: { report: StorageReport }) => {
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
                        'h-3.5 w-3.5 shrink-0 text-fg-subtle transition-transform',
                        expanded && 'rotate-90',
                      )}
                    />
                  )}
                  <span className="truncate">{m.label}</span>
                </span>
                <span className="shrink-0 text-xs text-fg-muted tabular-nums">
                  {formatBytes(m.bytes)} · {Math.round(m.share)}%
                </span>
              </div>
              <UsageBar pct={m.share} />
              {m.note && <p className="text-xs text-fg-subtle">{m.note}</p>}
            </>
          );
          return (
            <li key={m.id} className="px-5 py-2.5">
              {drillable ? (
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : m.id)}
                  className="block w-full space-y-1.5 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {head}
                </button>
              ) : (
                <div className="space-y-1.5">{head}</div>
              )}
              {expanded && (
                <div className="mt-2">
                  <Children id={m.id} parentBytes={m.bytes} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
};
