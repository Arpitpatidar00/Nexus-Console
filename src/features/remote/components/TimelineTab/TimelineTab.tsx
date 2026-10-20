import {
  History,
  Clock,
  AlertTriangle,
  PlusCircle,
  MinusCircle,
  RotateCw,
  HardDrive,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { Badge } from '@/shared/ui/Badge';
import { Spinner } from '@/shared/ui/Spinner';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import type { RemoteHost } from '@/features/remote/api/remote.schema';
import { useServerHistory } from '@/features/remote/api/useServerHistory';
import { formatBytes } from '@/shared/lib/format';

interface Props {
  host: RemoteHost;
  connected: boolean;
}

export const TimelineTab = ({ host, connected }: Props) => {
  const { data: history, isLoading, error, refetch } = useServerHistory(host.id, connected);

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-12">
        <Spinner className="size-6 text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorPanel
          error={error}
          fallback="Failed to load host history"
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  if (!history) return null;

  const diff = history.latestDiff;
  const hasDiffChanges =
    diff &&
    (diff.newContainers.length > 0 ||
      diff.removedContainers.length > 0 ||
      diff.restartedContainers.length > 0 ||
      diff.imageChanges.length > 0 ||
      diff.diskGrowth.length > 0 ||
      diff.newFailedUnits.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
      {/* What changed since last check */}
      <div className="bg-surface/50 rounded-2xl border border-hairline p-5 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-3 pb-3">
          <History className="size-5 text-primary" />
          <div>
            <h3 className="font-semibold text-fg">What Changed Since Last Look</h3>
            <p className="text-xs text-fg-subtle">
              Automatic diff between the current probe snapshot and your previous session
            </p>
          </div>
        </div>

        {!hasDiffChanges ? (
          <div className="flex items-center gap-2 rounded-xl border border-hairline bg-canvas/60 p-4 text-xs text-fg-muted">
            <CheckCircle2 className="size-4 text-emerald-500" />
            <span>
              No state drift detected. All containers, units, and images match the previous
              snapshot.
            </span>
          </div>
        ) : (
          <div className="divide-y divide-hairline rounded-xl border border-hairline bg-canvas/60">
            {diff?.newContainers.map((name) => (
              <div key={name} className="flex items-center gap-2.5 p-3 text-xs">
                <PlusCircle className="size-4 text-emerald-500" />
                <span className="font-medium text-emerald-500">New Container Added:</span>
                <span className="font-mono text-fg">{name}</span>
              </div>
            ))}

            {diff?.removedContainers.map((name) => (
              <div key={name} className="flex items-center gap-2.5 p-3 text-xs">
                <MinusCircle className="size-4 text-rose-500" />
                <span className="font-medium text-rose-500">Container Removed:</span>
                <span className="font-mono text-fg">{name}</span>
              </div>
            ))}

            {diff?.restartedContainers.map((msg) => (
              <div key={msg} className="flex items-center gap-2.5 p-3 text-xs">
                <RotateCw className="size-4 text-amber-500" />
                <span className="font-medium text-amber-500">Container Restarted:</span>
                <span className="font-mono text-fg">{msg}</span>
              </div>
            ))}

            {diff?.imageChanges.map((msg) => (
              <div key={msg} className="flex items-center gap-2.5 p-3 text-xs">
                <History className="size-4 text-primary" />
                <span className="font-medium text-primary">Image Updated:</span>
                <span className="font-mono text-fg">{msg}</span>
              </div>
            ))}

            {diff?.diskGrowth.map((msg) => (
              <div key={msg} className="flex items-center gap-2.5 p-3 text-xs">
                <HardDrive className="size-4 text-amber-500" />
                <span className="font-medium text-amber-500">Disk Growth:</span>
                <span className="font-mono text-fg">{msg}</span>
              </div>
            ))}

            {diff?.newFailedUnits.map((msg) => (
              <div key={msg} className="flex items-center gap-2.5 p-3 text-xs">
                <AlertTriangle className="size-4 text-rose-500" />
                <span className="font-medium text-rose-500">Unit Failed:</span>
                <span className="font-mono text-fg">{msg}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Incident Lifecycle Tracking */}
      <div className="bg-surface/50 rounded-2xl border border-hairline p-5 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-3 pb-3">
          <AlertTriangle className="size-5 text-amber-500" />
          <div>
            <h3 className="font-semibold text-fg">Critical Incident Log</h3>
            <p className="text-xs text-fg-subtle">
              Automatic lifecycle tracking for severe doctor & system findings
            </p>
          </div>
        </div>

        {history.incidents.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-hairline bg-canvas/60 p-4 text-xs text-fg-muted">
            <ShieldCheck className="size-4 text-emerald-500" />
            <span>Zero recorded incidents or outages for this host.</span>
          </div>
        ) : (
          <div className="divide-y divide-hairline rounded-xl border border-hairline bg-canvas/60">
            {history.incidents.map((inc) => {
              const isResolved = inc.resolvedAt !== null;
              return (
                <div key={inc.id} className="flex items-center justify-between p-3.5">
                  <div className="flex items-center gap-3">
                    <Badge variant={isResolved ? 'success' : 'danger'}>
                      {isResolved ? 'Resolved' : 'Active Incident'}
                    </Badge>
                    <div>
                      <span className="text-sm font-medium text-fg">{inc.summary}</span>
                      <div className="flex items-center gap-3 text-xs text-fg-subtle">
                        <span>
                          First seen: {new Date(inc.firstSeenAt * 1000).toLocaleTimeString()}
                        </span>
                        {isResolved ? (
                          <span>
                            • Resolved at: {new Date(inc.resolvedAt! * 1000).toLocaleTimeString()}
                          </span>
                        ) : (
                          <span>
                            • Last seen: {new Date(inc.lastSeenAt * 1000).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Rolling Snapshot History */}
      {history.summaries.length > 0 && (
        <div className="bg-surface/50 rounded-2xl border border-hairline p-5 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-3 pb-3">
            <Clock className="size-5 text-muted-foreground" />
            <div>
              <h3 className="font-semibold text-fg">Probe Check History</h3>
              <p className="text-xs text-fg-subtle">
                Rolling historical snapshots with load averages and memory footprint
              </p>
            </div>
          </div>

          <div className="divide-y divide-hairline rounded-xl border border-hairline bg-canvas/60">
            {history.summaries.slice(0, 5).map((snap, i) => (
              <div key={i} className="flex items-center justify-between p-3.5 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-fg-muted">
                    {new Date(snap.capturedAt * 1000).toLocaleTimeString()}
                  </span>
                  <span className="font-mono text-fg">Load 1m: {snap.cpuLoad1.toFixed(2)}</span>
                  <span className="text-fg-subtle">•</span>
                  <span className="font-mono text-fg">
                    Mem: {formatBytes(snap.memTotalBytes - snap.memAvailBytes)} /{' '}
                    {formatBytes(snap.memTotalBytes)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="neutral">{snap.containerCount} containers</Badge>
                  {snap.criticalFindingCount > 0 && (
                    <Badge variant="danger">{snap.criticalFindingCount} issues</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
