import { formatBytes } from '@/shared/lib/format';
import { Spinner } from '@/shared/ui/Spinner';
import { useDrill } from '@/features/maclean/api/macleanMutations';
import { UsageBar } from '@/features/maclean/components/UsageBar';
import type { StorageMapDrilldownProps } from './StorageMap.types';

export const StorageMapDrilldown = ({ id, parentBytes }: StorageMapDrilldownProps) => {
  const q = useDrill(id, true);

  if (q.isPending) {
    return (
      <p className="flex items-center gap-2 py-1 text-xs text-fg-muted">
        <Spinner className="h-3.5 w-3.5" /> Measuring what’s inside…
      </p>
    );
  }

  if (q.isError) {
    return <p className="py-1 text-xs text-danger">Couldn’t look inside this folder.</p>;
  }

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
