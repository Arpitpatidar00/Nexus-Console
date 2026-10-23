import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { formatBytes } from '@/shared/lib/format';
import { useIpcEvent } from '@/shared/tauri';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import { CLEAN_EVENT, cleanEventSchema } from '@/features/maclean/api/maclean.schema';
import { defaultSelection, isCleanable, selectedTotal } from '@/features/maclean/utils/storage';
import { Card } from '@/features/maclean/components/Card';
import { ShortcutBar } from '@/features/maclean/components/ShortcutBar';
import { cleanableIds } from '@/features/maclean/utils/shortcuts';
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

  const same = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
    a.size > 0 && a.size === b.size && [...a].every((x) => b.has(x));
  const recommended = defaultSelection(items);
  const everything = cleanableIds(items);
  const shortcuts = [
    {
      label: 'Recommended',
      hint: 'Everything that comes back on its own. Unused Docker images stay unticked: you may still want them.',
      bytes: selectedTotal(items, recommended),
      active: same(selected, recommended),
      onClick: () => setSelected(recommended),
    },
    {
      label: 'Everything',
      hint: 'Every item that can be cleaned right now, including unused Docker images.',
      bytes: selectedTotal(items, everything),
      active: same(selected, everything),
      onClick: () => setSelected(everything),
    },
  ];

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
      <ShortcutBar
        label="One click:"
        shortcuts={shortcuts}
        onClear={selected.size > 0 && !cleaning ? () => setSelected(new Set()) : undefined}
        className="border-b border-hairline px-5 py-2.5"
      />
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
