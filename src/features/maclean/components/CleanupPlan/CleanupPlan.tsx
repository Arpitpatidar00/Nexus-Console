import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { formatBytes } from '@/shared/lib/format';
import { useIpcEvent } from '@/shared/tauri';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import { CLEAN_EVENT, cleanEventSchema } from '@/features/maclean/api/maclean.schema';
import { defaultSelection, isCleanable, selectedTotal } from '@/features/maclean/utils/storage';
import { Card } from '@/features/maclean/components/Card';
import { CleanupPlanRow } from './CleanupPlanRow';
import type { CleanupPlanProps, LiveCleanEvents } from './CleanupPlan.types';

/** The script's cleanup plan: pick items, one native confirm in Rust, live
 * per-item progress. Mounted per report (keyed by scan time), so the default
 * selection follows each fresh scan. */
export const CleanupPlan = ({ items, cleaning, onClean }: CleanupPlanProps) => {
  const [selected, setSelected] = useState(() => defaultSelection(items));
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [live, setLive] = useState<LiveCleanEvents>({});

  useIpcEvent<unknown>(CLEAN_EVENT, (e) => {
    const ev = cleanEventSchema.safeParse(e.payload);
    if (ev.success) setLive((l) => ({ ...l, [ev.data.id]: ev.data }));
  });

  const reclaimable = items.filter(isCleanable).reduce((n, i) => n + i.bytes, 0);
  const total = selectedTotal(items, selected);

  const toggleSet = (id: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
        {rows.map((item) => (
          <CleanupPlanRow
            key={item.id}
            item={item}
            live={live[item.id]}
            selected={selected.has(item.id)}
            expanded={open.has(item.id)}
            cleaning={cleaning}
            onToggleSelect={(id) => toggleSet(id, setSelected)}
            onToggleExpand={(id) => toggleSet(id, setOpen)}
          />
        ))}
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
