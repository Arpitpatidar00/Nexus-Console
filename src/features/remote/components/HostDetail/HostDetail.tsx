import { useState } from 'react';
import { Pencil, Plug, RotateCw, ServerOff, TerminalSquare, Unplug } from 'lucide-react';
import { useAppDispatch } from '@/shared/state/hooks';
import { openTerminal } from '@/shared/state/terminalsSlice';
import { cn } from '@/shared/lib/cn';
import { IpcError } from '@/shared/tauri';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { Spinner } from '@/shared/ui/Spinner';
import type { RemoteHost } from '@/features/remote/api/remote.schema';
import { useHostConnection } from '@/features/remote/api/useHostConnection';
import { useHostSnapshot } from '@/features/remote/api/useHostSnapshot';
import { useHostHistory } from '@/features/remote/api/useHostHistory';
import { useConnectHost, useDisconnectHost } from '@/features/remote/api/remoteMutations';
import { healthOf, issueCount } from '@/features/remote/utils/health';
import { hostAddress } from '@/features/remote/utils/host';
import { EnvBadge } from '@/features/remote/components/EnvBadge';
import { HostStatus, describeStatus } from '@/features/remote/components/HostStatus';
import { ConnectionError } from '@/features/remote/components/ConnectionError';
import { OverviewPanel } from '@/features/remote/components/OverviewPanel';
import { ContainersTable } from '@/features/remote/components/ContainersTable';
import { ServicesPanel } from '@/features/remote/components/ServicesPanel';
import { PortsPanel } from '@/features/remote/components/PortsPanel';
import { IssuesPanel } from '@/features/remote/components/IssuesPanel';

type View = 'overview' | 'containers' | 'services' | 'ports' | 'issues';

const BodySkeleton = () => (
  <div aria-hidden className="space-y-5 p-5">
    {Array.from({ length: 4 }, (_, i) => (
      <div key={i} className="space-y-2">
        <div className="h-4 w-40 animate-pulse rounded bg-list" />
        <div className="h-1.5 animate-pulse rounded-full bg-list" />
      </div>
    ))}
  </div>
);

export const HostDetail = ({ host, onEdit }: { host: RemoteHost; onEdit: () => void }) => {
  const [view, setView] = useState<View>('overview');
  const dispatch = useAppDispatch();
  const openShell = () =>
    dispatch(
      openTerminal({
        target: { type: 'remoteShell', hostId: host.id },
        title: `${host.label} · ssh`,
      }),
    );
  const conn = useHostConnection(host.id);
  const connected = conn.state === 'connected';
  const snap = useHostSnapshot(host.id, connected);
  const connect = useConnectHost(host.id);
  const disconnect = useDisconnectHost();
  const s = snap.data;
  const history = useHostHistory(host.id);
  const status = describeStatus(conn.state, healthOf(s), issueCount(s), conn.error?.kind);
  // A probe that failed for a non-ssh reason (unreadable output) is shown
  // over the last good data; `busy` just means the previous probe is still out.
  const probeError =
    snap.error instanceof IpcError && snap.error.kind !== 'busy' && conn.state === 'connected'
      ? snap.error
      : null;

  const issues = s?.findings.length ?? 0;
  const views = [
    { value: 'overview' as const, label: 'Overview' },
    { value: 'containers' as const, label: 'Containers' },
    { value: 'services' as const, label: 'Services' },
    { value: 'ports' as const, label: 'Ports' },
    { value: 'issues' as const, label: issues > 0 ? `Issues (${issues})` : 'Issues' },
  ];

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-paper">
      {/* Fixed-height header: contents swap, the layout never jumps. */}
      <header className="flex h-[68px] shrink-0 items-center gap-3 border-b border-border px-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold text-fg">{host.label}</h2>
            <EnvBadge env={host.env} />
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
            <span className="truncate font-mono">{hostAddress(host)}</span>
            <span aria-hidden>·</span>
            <HostStatus {...status} />
            {s && connected && (
              <span className="hidden text-fg-subtle tabular-nums lg:inline">
                · updated {new Date(s.capturedAt * 1000).toLocaleTimeString()} · {s.probeMs} ms
              </span>
            )}
          </p>
        </div>
        {connected && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh"
            title="Refresh"
            disabled={snap.isFetching}
            onClick={() => void snap.refetch()}
          >
            <RotateCw
              className={cn(
                'h-4 w-4',
                snap.isFetching && 'animate-spin motion-reduce:animate-none',
              )}
            />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open a shell on this server"
          title="Terminal"
          onClick={openShell}
        >
          <TerminalSquare className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Edit server" title="Edit" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        {connected ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={disconnect.isPending}
            onClick={() => disconnect.mutate(host.id)}
          >
            <Unplug className="h-4 w-4" />
            Disconnect
          </Button>
        ) : (
          <Button size="sm" disabled={conn.state === 'connecting'} onClick={() => connect.mutate()}>
            {conn.state === 'connecting' ? (
              <Spinner className="text-current" />
            ) : (
              <Plug className="h-4 w-4" />
            )}
            Connect
          </Button>
        )}
      </header>

      {conn.state === 'notConnected' ? (
        <EmptyState
          icon={<ServerOff className="h-8 w-8" />}
          title="Not connected"
          description="Nexus connects with your own ssh, keys and agent, and only when you ask."
        />
      ) : conn.state === 'connecting' ? (
        <BodySkeleton />
      ) : conn.state === 'error' && conn.error ? (
        <ConnectionError
          error={conn.error}
          onRetry={() => connect.mutate()}
          retrying={connect.isPending}
          onOpenTerminal={openShell}
        />
      ) : (
        <>
          <div className="flex shrink-0 items-center border-b border-border px-5 py-2.5">
            <SegmentedControl
              ariaLabel="Server view"
              value={view}
              options={views}
              onChange={setView}
            />
          </div>
          {probeError && (
            <div className="shrink-0 px-5 pt-4">
              <ErrorPanel
                error={probeError}
                fallback="The check failed"
                onRetry={() => void snap.refetch()}
              />
            </div>
          )}
          {!s ? (
            snap.isError ? null : (
              <BodySkeleton />
            )
          ) : view === 'overview' ? (
            <OverviewPanel snapshot={s} history={history} />
          ) : view === 'containers' ? (
            <ContainersTable host={host} snapshot={s} />
          ) : view === 'services' ? (
            <ServicesPanel snapshot={s} />
          ) : view === 'ports' ? (
            <PortsPanel snapshot={s} />
          ) : (
            <IssuesPanel snapshot={s} />
          )}
        </>
      )}
    </section>
  );
};
