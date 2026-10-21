import { useState } from 'react';
import { Pencil, Plug, RotateCw, ServerOff, TerminalSquare, Unplug, Send } from 'lucide-react';
import { useAppDispatch } from '@/shared/state/hooks';
import { openTerminal } from '@/shared/state/terminalsSlice';
import { cn } from '@/shared/lib/cn';
import { IpcError } from '@/shared/tauri';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { Spinner } from '@/shared/ui/Spinner';
import { Panel } from '@/shared/ui/Panel';
import { Badge, EnvBadge } from '@/shared/ui/Badge';
import type { RemoteHost } from '@/features/remote/api/remote.schema';
import { useHostConnection } from '@/features/remote/api/useHostConnection';
import { useHostSnapshot } from '@/features/remote/api/useHostSnapshot';
import { useHostHistory } from '@/features/remote/api/useHostHistory';
import { useConnectHost, useDisconnectHost } from '@/features/remote/api/remoteMutations';
import { hostAddress } from '@/features/remote/utils/host';
import { ConnectionError } from '@/features/remote/components/ConnectionError';
import { OverviewPanel } from '@/features/remote/components/OverviewPanel';
import { ContainersTable } from '@/features/remote/components/ContainersTable';
import { ServicesPanel } from '@/features/remote/components/ServicesPanel';
import { PortsPanel } from '@/features/remote/components/PortsPanel';
import { IssuesPanel } from '@/features/remote/components/IssuesPanel';
import { TunnelsPanel } from '@/features/remote/components/TunnelsPanel';
import { ComposeStacksView } from '@/features/remote/components/ComposeStacksView';
import { InspectionPanel } from '@/features/remote/components/InspectionPanel';
import { ServerDiskPanel } from '@/features/remote/components/ServerDiskPanel';
import { NotesTab } from '@/features/remote/components/NotesTab';
import { TimelineTab } from '@/features/remote/components/TimelineTab';
import { RunbooksPanel } from '@/features/remote/components/RunbooksPanel';
import { LogsViewer } from '@/features/remote/components/LogsViewer';
import { DeployCenterView } from '@/features/remote/components/DeployCenterView';
import { ParityAuditorView } from '@/features/remote/components/ParityAuditorView';
import { ImageTeleportDialog } from '@/features/remote/components/ImageTeleportDialog';

type View =
  | 'overview'
  | 'stacks'
  | 'deploy'
  | 'parity'
  | 'containers'
  | 'services'
  | 'nginx'
  | 'ports'
  | 'disk'
  | 'files'
  | 'logs'
  | 'timeline'
  | 'notes'
  | 'runbooks'
  | 'tunnels'
  | 'issues';

const BodySkeleton = () => (
  <div aria-hidden className="space-y-5 p-5">
    {Array.from({ length: 4 }, (_, i) => (
      <div key={i} className="space-y-2">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-2 animate-pulse rounded-full bg-muted" />
      </div>
    ))}
  </div>
);

export const HostDetail = ({ host, onEdit }: { host: RemoteHost; onEdit: () => void }) => {
  const [view, setView] = useState<View>('overview');
  const [teleportOpen, setTeleportOpen] = useState(false);
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

  const probeError =
    snap.error instanceof IpcError && snap.error.kind !== 'busy' && conn.state === 'connected'
      ? snap.error
      : null;

  const issues = s?.findings.length ?? 0;
  const views = [
    { value: 'overview' as const, label: 'Overview' },
    { value: 'stacks' as const, label: 'Stacks' },
    { value: 'deploy' as const, label: 'Deploy & Ship' },
    { value: 'parity' as const, label: 'Parity' },
    { value: 'containers' as const, label: 'Containers' },
    { value: 'services' as const, label: 'Services' },
    { value: 'nginx' as const, label: 'Nginx & Cron' },
    { value: 'ports' as const, label: 'Ports' },
    { value: 'disk' as const, label: 'Disk & Cleanup' },
    { value: 'files' as const, label: 'Files' },
    { value: 'logs' as const, label: 'Logs' },
    { value: 'timeline' as const, label: 'Timeline' },
    { value: 'notes' as const, label: 'Notes' },
    { value: 'runbooks' as const, label: 'Runbooks' },
    { value: 'tunnels' as const, label: 'Tunnels' },
    { value: 'issues' as const, label: issues > 0 ? `Issues (${issues})` : 'Issues' },
  ];

  const statusTone: 'neutral' | 'danger' | 'success' = !connected
    ? 'neutral'
    : issues > 0
      ? 'danger'
      : 'success';
  const statusLabel = !connected
    ? 'Not connected'
    : issues > 0
      ? `${issues} issue${issues === 1 ? '' : 's'}`
      : 'Healthy';

  return (
    <Panel className="flex min-h-0 flex-col gap-0 overflow-hidden p-0">
      {/* Header with Title, Env badge, and Actions */}
      <header className="flex h-[72px] shrink-0 items-center justify-between gap-3 border-b border-hairline px-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h2 className="truncate font-display text-xl font-semibold text-foreground">
              {host.label}
            </h2>
            <EnvBadge env={host.env} />
            <Badge tone={statusTone} dot size="sm">
              {statusLabel}
            </Badge>
            {host.env === 'prod' && connected && (
              <Badge
                tone="warning"
                size="sm"
                title="Auto-disconnects after 10m idle or on screen lock. Use tmux for long prod jobs."
              >
                Idle guard: 10m
              </Badge>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <span className="truncate">{hostAddress(host)}</span>
            {s && connected && (
              <span className="hidden text-muted-foreground tabular-nums lg:inline">
                · {s.system.os || 'Linux'} · updated{' '}
                {new Date(s.capturedAt * 1000).toLocaleTimeString()} · {s.probeMs} ms
              </span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {connected && host.env !== 'prod' && (
            <Button
              variant="glass"
              size="sm"
              aria-label="Teleport local image over SSH"
              title="Push local image over SSH"
              onClick={() => setTeleportOpen(true)}
            >
              <Send className="size-3.5 text-primary" />
              Teleport
            </Button>
          )}
          {connected && (
            <Button
              variant="glass"
              size="iconSm"
              aria-label="Refresh"
              title="Refresh"
              disabled={snap.isFetching}
              onClick={() => void snap.refetch()}
            >
              <RotateCw
                className={cn(
                  'size-3.5',
                  snap.isFetching && 'animate-spin motion-reduce:animate-none',
                )}
              />
            </Button>
          )}
          <Button
            variant="glass"
            size="sm"
            aria-label="Open a shell on this server"
            title="Terminal"
            onClick={openShell}
          >
            <TerminalSquare className="size-4" />
            Terminal
          </Button>
          <Button
            variant="glass"
            size="iconSm"
            aria-label="Edit server"
            title="Edit"
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
          {connected ? (
            <Button
              variant="glass"
              size="sm"
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate(host.id)}
            >
              <Unplug className="size-3.5" />
              Disconnect
            </Button>
          ) : (
            <Button
              variant="ember"
              size="sm"
              disabled={conn.state === 'connecting'}
              onClick={() => connect.mutate()}
            >
              {conn.state === 'connecting' ? (
                <Spinner className="text-current" />
              ) : (
                <Plug className="size-3.5" />
              )}
              Connect
            </Button>
          )}
        </div>
      </header>

      {conn.state === 'notConnected' ? (
        <EmptyState
          icon={<ServerOff className="size-10" />}
          title="Not connected"
          description="Stackroost connects securely with your own ssh keys and agent, and only when you ask."
          action={
            <Button
              variant="ember"
              size="sm"
              disabled={connect.isPending}
              onClick={() => connect.mutate()}
            >
              <Plug className="size-3.5" />
              Connect to {host.label}
            </Button>
          }
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
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center overflow-x-auto border-b border-hairline px-6 py-2.5">
            <SegmentedControl
              ariaLabel="Server view"
              value={view}
              options={views}
              onChange={setView}
            />
          </div>
          {probeError && (
            <div className="shrink-0 px-6 pt-4">
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
          ) : view === 'stacks' ? (
            <ComposeStacksView host={host} snapshot={s} />
          ) : view === 'deploy' ? (
            <DeployCenterView host={host} snapshot={s} connected={connected} />
          ) : view === 'parity' ? (
            <ParityAuditorView host={host} connected={connected} />
          ) : view === 'containers' ? (
            <ContainersTable host={host} snapshot={s} />
          ) : view === 'services' ? (
            <ServicesPanel snapshot={s} />
          ) : view === 'nginx' ? (
            <InspectionPanel host={host} connected={connected} />
          ) : view === 'ports' ? (
            <PortsPanel snapshot={s} />
          ) : view === 'disk' ? (
            <ServerDiskPanel host={host} connected={connected} />
          ) : view === 'files' ? (
            <div className="flex min-h-0 flex-1 p-6">
              <div className="flex w-full items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
                <div>
                  <span className="font-bold">Coming back after safety review (T-04):</span>
                  <p className="mt-0.5 text-amber-300/80">
                    The SFTP remote file browser is temporarily frozen while remote path
                    sanitization (prohibiting unescaped quotes, control characters, and directory
                    traversal) and safe argv streaming are implemented in Phase A.
                  </p>
                </div>
              </div>
            </div>
          ) : view === 'logs' ? (
            <LogsViewer host={host} snapshot={s} />
          ) : view === 'timeline' ? (
            <TimelineTab host={host} connected={connected} />
          ) : view === 'notes' ? (
            <NotesTab host={host} />
          ) : view === 'runbooks' ? (
            <RunbooksPanel host={host} />
          ) : view === 'tunnels' ? (
            <TunnelsPanel host={host} />
          ) : (
            <IssuesPanel snapshot={s} />
          )}
        </div>
      )}

      <ImageTeleportDialog host={host} open={teleportOpen} onClose={() => setTeleportOpen(false)} />
    </Panel>
  );
};
