import { formatBytes } from '@/shared/lib/format';
import type { StorageReport } from '@/features/maclean/api/maclean.schema';
import { mapShares } from '@/features/maclean/utils/storage';
import { Card } from '@/features/maclean/components/Card';
import { UsageBar } from '@/features/maclean/components/UsageBar';

export const StorageMap = ({ report }: { report: StorageReport }) => (
  <Card title="Where your storage goes">
    <ul className="divide-y divide-border">
      {mapShares(report).map((m) => (
        <li key={m.id} className="space-y-1.5 px-5 py-2.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-fg" title={m.note ?? undefined}>
              {m.label}
            </span>
            <span className="shrink-0 text-xs text-fg-muted tabular-nums">
              {formatBytes(m.bytes)} · {Math.round(m.share)}%
            </span>
          </div>
          <UsageBar pct={m.share} />
          {m.note && <p className="text-xs text-fg-subtle">{m.note}</p>}
        </li>
      ))}
    </ul>
  </Card>
);
