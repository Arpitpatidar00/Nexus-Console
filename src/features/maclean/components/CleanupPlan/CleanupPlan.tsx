import { useState } from 'react';
import { Check, ChevronRight, CircleAlert, Sparkles } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatBytes } from '@/shared/lib/format';
import { useIpcEvent } from '@/shared/tauri';
import { Button } from '@/shared/ui/Button';
import { Checkbox } from '@/shared/ui/Checkbox';
import { Spinner } from '@/shared/ui/Spinner';
import {
  CLEAN_EVENT,
  cleanEventSchema,
  type CleanEvent,
  type CleanItem,
} from '@/features/maclean/api/maclean.schema';
import { defaultSelection, isCleanable, selectedTotal } from '@/features/maclean/utils/storage';
import { Card } from '@/features/maclean/components/Card';

type Live = Record<string, CleanEvent>;

const Status = ({ item, live }: { item: CleanItem; live?: CleanEvent }) => {
  if (live?.state === 'running')
    return (
      <span className="flex items-center gap-1.5 text-xs text-fg-muted">
        <Spinner className="h-3.5 w-3.5" /> Cleaning…
      </span>
    );
  if (live?.state === 'done')
    return (
      <span className="flex items-center gap-1 text-xs text-running">
        <Check className="h-3.5 w-3.5" /> Cleaned
      </span>
    );
  if (live?.state === 'error')
    return (
      <span className="flex min-w-0 items-center gap-1 text-xs text-danger" title={live.message}>
        <CircleAlert className="h-3.5 w-3.5 shrink-0" />{' '}
        <span className="truncate">{live.message}</span>
      </span>
    );
  if (item.skip) return <span className="truncate text-xs text-warn">Skipped: {item.skip}</span>;
  if (item.bytes === 0) return <span className="text-xs text-fg-subtle">Already clean</span>;
  return null;
};

/** The script's cleanup plan: pick items, one native confirm in Rust, live
 * per-item progress. Mounted per report (keyed by scan time), so the default
 * selection follows each fresh scan. */
export const CleanupPlan = ({
  items,
  cleaning,
  onClean,
}: {
  items: CleanItem[];
  cleaning: boolean;
  onClean: (ids: string[]) => void;
}) => {
  const [selected, setSelected] = useState(() => defaultSelection(items));
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [live, setLive] = useState<Live>({});
  useIpcEvent<unknown>(CLEAN_EVENT, (e) => {
    const ev = cleanEventSchema.safeParse(e.payload);
    if (ev.success) setLive((l) => ({ ...l, [ev.data.id]: ev.data }));
  });

  const reclaimable = items.filter(isCleanable).reduce((n, i) => n + i.bytes, 0);
  const total = selectedTotal(items, selected);
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  // Biggest first, then the rest; skipped and empty ones sink to the bottom.
  const rows = [...items].sort(
    (a, b) => Number(isCleanable(b)) - Number(isCleanable(a)) || b.bytes - a.bytes,
  );

  return (
    <Card
      title="Cleanup plan"
      aside={
        <span className="text-xs text-fg-subtle">
          Only caches, logs and build output that tools recreate
        </span>
      }
    >
      <ul className="divide-y divide-border">
        {rows.map((i) => {
          const can = isCleanable(i);
          const expanded = open.has(i.id);
          return (
            <li key={i.id} className={cn('px-5 py-2.5', !can && 'opacity-70')}>
              <div className="flex items-center gap-3">
                <Checkbox
                  ariaLabel={`Clean ${i.label}`}
                  checked={can && selected.has(i.id)}
                  disabled={!can || cleaning}
                  onChange={() => setSelected((s) => toggle(s, i.id))}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm text-fg">{i.label}</span>
                    {i.detail.length > 0 && (
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-label={`What's in ${i.label}`}
                        onClick={() => setOpen((s) => toggle(s, i.id))}
                        className="rounded p-0.5 text-fg-subtle hover:bg-list hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <ChevronRight
                          className={cn(
                            'h-3.5 w-3.5 transition-transform',
                            expanded && 'rotate-90',
                          )}
                        />
                      </button>
                    )}
                  </div>
                  {i.note && <p className="text-xs text-fg-subtle">{i.note}</p>}
                </div>
                <div className="flex w-56 shrink-0 justify-end">
                  <Status item={i} live={live[i.id]} />
                </div>
                <span className="w-20 shrink-0 text-right text-sm text-fg-muted tabular-nums">
                  {i.bytes > 0 ? formatBytes(i.bytes) : '—'}
                </span>
              </div>
              {expanded && (
                <ul className="mt-1.5 ml-8 space-y-0.5 text-xs text-fg-muted">
                  {i.detail.map((d) => (
                    <li key={d} className="truncate font-mono" title={d}>
                      {d}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
        <p className="text-sm text-fg-muted tabular-nums">
          Selected <span className="font-semibold text-fg">{formatBytes(total)}</span> of{' '}
          {formatBytes(reclaimable)} reclaimable
        </p>
        <Button size="sm" disabled={total === 0 || cleaning} onClick={() => onClean([...selected])}>
          {cleaning ? <Spinner className="text-current" /> : <Sparkles className="h-4 w-4" />}
          Clean selected…
        </Button>
      </footer>
    </Card>
  );
};
