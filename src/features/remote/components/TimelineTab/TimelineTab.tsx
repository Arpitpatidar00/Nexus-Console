import { AlertTriangle, CheckCircle2, CircleDot, Info, ShieldCheck } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/Badge';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import type { RemoteHost } from '@/features/remote/api/remote.schema';
import { useServerHistory } from '@/features/remote/api/useServerHistory';
import { DetailSection } from '@/features/remote/components/DetailSection';
import {
  changesOf,
  formatSpan,
  humanizeId,
  type ChangeTone,
} from '@/features/remote/utils/timeline';
import { useNow } from '@/shared/lib/useNow';

interface Props {
  host: RemoteHost;
  connected: boolean;
}

const RECENT_CHECKS = 10;

const time = (epoch: number) =>
  new Date(epoch * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const TONE_ICON: Record<ChangeTone, { icon: typeof Info; className: string }> = {
  danger: { icon: AlertTriangle, className: 'text-destructive' },
  warning: { icon: AlertTriangle, className: 'text-warning' },
  info: { icon: CircleDot, className: 'text-info' },
  success: { icon: CheckCircle2, className: 'text-success' },
};

const Skeleton = () => (
  <div aria-hidden className="space-y-3 px-6 py-5">
    {Array.from({ length: 5 }, (_, i) => (
      <div key={i} className="h-5 animate-pulse rounded bg-muted" />
    ))}
  </div>
);

export const TimelineTab = ({ host, connected }: Props) => {
  const { data: history, isLoading, error, refetch } = useServerHistory(host.id, connected);
  // Ages ("opened 5m ago") stay current while the tab is open.
  const nowMs = useNow(60_000);

  if (isLoading) return <Skeleton />;
  if (error) {
    return (
      <div className="px-6 py-5">
        <ErrorPanel
          error={error}
          fallback="Couldn't load this server's history"
          onRetry={() => void refetch()}
        />
      </div>
    );
  }
  if (!history) return null;

  const checks = history.summaries;
  const [prev, last] = checks.slice(-2);
  const changes = changesOf(history.latestDiff);
  const incidents = [...history.incidents].sort((a, b) => b.openedAtEpoch - a.openedAtEpoch);
  const nowSecs = nowMs / 1000;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <DetailSection
        title="Since the previous check"
        description={
          prev && last
            ? `Compares the check at ${time(last.atEpoch)} with the one at ${time(prev.atEpoch)}.`
            : 'Needs two checks. Stackroost records one each time it refreshes this server.'
        }
      >
        {changes.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 shrink-0 text-success" />
            {prev
              ? 'Nothing changed: same containers, images, services and disk.'
              : 'Not enough checks yet.'}
          </p>
        ) : (
          <ul className="divide-y divide-hairline rounded-lg border border-hairline">
            {changes.map((c, i) => {
              const { icon: Icon, className } = TONE_ICON[c.tone];
              return (
                <li key={i} className="flex min-w-0 items-center gap-3 px-3 py-2.5 text-sm">
                  <Icon className={cn('size-4 shrink-0', className)} aria-hidden />
                  <span className="shrink-0 text-fg">{c.text}</span>
                  {c.subject && (
                    <span
                      className="min-w-0 truncate font-mono text-xs text-muted-foreground"
                      title={c.subject}
                    >
                      {c.subject}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DetailSection>

      <DetailSection
        title="Incidents"
        description="Critical issues: when each one appeared, and when it cleared."
        aside={
          incidents.some((i) => i.resolvedAtEpoch == null) ? (
            <Badge tone="danger" size="sm" dot>
              {incidents.filter((i) => i.resolvedAtEpoch == null).length} ongoing
            </Badge>
          ) : null
        }
      >
        {incidents.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0 text-success" />
            No critical issues recorded for this server.
          </p>
        ) : (
          <ul className="divide-y divide-hairline rounded-lg border border-hairline">
            {incidents.map((inc) => {
              const open = inc.resolvedAtEpoch == null;
              const span = (inc.resolvedAtEpoch ?? nowSecs) - inc.openedAtEpoch;
              return (
                <li key={inc.id} className="flex items-center justify-between gap-4 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-fg">{humanizeId(inc.title)}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Started {time(inc.openedAtEpoch)} ·{' '}
                      {open ? `ongoing for ${formatSpan(span)}` : `lasted ${formatSpan(span)}`}
                    </p>
                  </div>
                  <Badge tone={open ? 'danger' : 'success'} size="sm">
                    {open ? 'Ongoing' : 'Resolved'}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </DetailSection>

      <DetailSection
        title="Recent checks"
        description="Newest first. A check is recorded each time this server refreshes."
      >
        {checks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No checks recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-hairline">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Checked</th>
                  <th className="px-3 py-2 text-right font-medium">Containers</th>
                  <th className="px-3 py-2 text-right font-medium">Fullest disk</th>
                  <th className="px-3 py-2 text-right font-medium">Failed services</th>
                  <th className="px-3 py-2 text-right font-medium">Critical issues</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline tabular-nums">
                {checks
                  .slice(-RECENT_CHECKS)
                  .reverse()
                  .map((c) => (
                    <tr key={c.atEpoch}>
                      <td className="px-3 py-2 whitespace-nowrap text-fg">{time(c.atEpoch)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {c.containerNames.length}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right',
                          c.diskUsagePct >= 90
                            ? 'text-destructive'
                            : c.diskUsagePct >= 80
                              ? 'text-warning'
                              : 'text-muted-foreground',
                        )}
                      >
                        {c.diskUsagePct}%
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right',
                          c.failedUnits.length ? 'text-destructive' : 'text-muted-foreground',
                        )}
                      >
                        {c.failedUnits.length}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right',
                          c.criticalFindingIds.length
                            ? 'text-destructive'
                            : 'text-muted-foreground',
                        )}
                      >
                        {c.criticalFindingIds.length}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </DetailSection>
    </div>
  );
};
