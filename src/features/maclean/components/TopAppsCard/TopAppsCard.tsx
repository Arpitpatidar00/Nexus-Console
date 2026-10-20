import { formatBytes } from '@/shared/lib/format';
import { Card } from '@/features/maclean/components/Card';
import { UsageBar } from '@/features/maclean/components/UsageBar';
import type { TopAppsCardProps } from './TopAppsCard.types';

export const TopAppsCard = ({ report }: TopAppsCardProps) => {
  const max = report.topApps[0]?.bytes ?? 1;

  return (
    <Card
      title="Using the most memory"
      aside={<span className="text-xs text-fg-subtle">Reported only</span>}
    >
      <ul className="divide-y divide-border">
        {report.topApps.map((a) => (
          <li key={a.name} className="space-y-1.5 px-5 py-2.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-fg">
                {a.name}
                {a.processes > 1 && (
                  <span className="ml-1.5 text-xs text-fg-subtle">{a.processes} processes</span>
                )}
              </span>
              <span className="shrink-0 text-xs text-fg-muted tabular-nums">
                {formatBytes(a.bytes)}
              </span>
            </div>
            <UsageBar pct={(a.bytes * 100) / max} />
          </li>
        ))}
      </ul>
      <p className="border-t border-border px-5 py-2 text-xs text-fg-subtle">
        Resident memory per app. Compressed and swapped pages aren’t included, so the total is
        smaller than Memory used.
      </p>
    </Card>
  );
};
