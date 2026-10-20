import { TriangleAlert } from 'lucide-react';
import { formatBytes } from '@/shared/lib/format';
import { pct } from '@/features/maclean/utils/storage';
import { Card } from '@/features/maclean/components/Card';
import { UsageBar } from '@/features/maclean/components/UsageBar';
import type { VolumesListProps } from './VolumesList.types';

/** How macOS splits the drive internally. Oversized = warn icon + words. */
export const VolumesList = ({ report }: VolumesListProps) => (
  <Card title="Disk volumes">
    <ul className="divide-y divide-border">
      {report.volumes.map((v) => (
        <li key={`${v.role}:${v.label}`} className="space-y-1.5 px-5 py-2.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-1.5 text-fg">
              {v.oversized && (
                <TriangleAlert aria-hidden className="h-3.5 w-3.5 shrink-0 text-warn" />
              )}
              <span className="truncate">{v.label}</span>
            </span>
            <span className="shrink-0 text-xs text-fg-muted tabular-nums">
              {formatBytes(v.bytes)}
            </span>
          </div>
          <UsageBar
            pct={pct(v.bytes, report.disk.totalBytes)}
            tone={v.oversized ? 'warn' : 'neutral'}
          />
          <p className="text-xs text-fg-subtle">
            {v.oversized && <span className="font-medium text-warn">Larger than usual. </span>}
            {v.why}
          </p>
        </li>
      ))}
    </ul>
  </Card>
);
