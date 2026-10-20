import { TriangleAlert } from 'lucide-react';
import { formatBytes } from '@/shared/lib/format';
import { UsageBar } from '@/features/maclean/components/UsageBar';
import type { DeepScanEntryRowProps } from './DeepScanCard.types';

export const DeepScanEntryRow = ({ entry, dataUsedBytes }: DeepScanEntryRowProps) => (
  <li className="space-y-1.5 px-5 py-2.5">
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="flex min-w-0 items-center gap-1.5 text-fg">
        {entry.flagged && <TriangleAlert aria-hidden className="h-3.5 w-3.5 shrink-0 text-warn" />}
        <span className="truncate">{entry.label}</span>
      </span>
      <span className="shrink-0 text-xs text-fg-muted tabular-nums">
        {formatBytes(entry.bytes)}
      </span>
    </div>
    <UsageBar
      pct={dataUsedBytes ? (entry.bytes * 100) / dataUsedBytes : 0}
      tone={entry.flagged ? 'warn' : 'neutral'}
    />
    <p className="text-xs text-fg-subtle">{entry.why}</p>
  </li>
);
