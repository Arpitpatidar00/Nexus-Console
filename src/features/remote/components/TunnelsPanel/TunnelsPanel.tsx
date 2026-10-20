import { useState, useMemo } from 'react';
import { useTunnels } from '@/features/remote/api/useTunnels';
import { useRemoteState } from '@/features/remote/api/useRemoteState';
import {
  useOpenTunnel,
  useCloseTunnel,
  useRemoveTunnel,
} from '@/features/remote/api/tunnelMutations';
import type { RemoteHost, TunnelStatus } from '@/features/remote/api/remote.schema';
import { AddTunnelDialog } from './AddTunnelDialog';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { Spinner } from '@/shared/ui/Spinner';
import { EmptyState } from '@/shared/ui/EmptyState';
import { cn } from '@/shared/lib/cn';
import {
  Network,
  Plus,
  Play,
  Square,
  Copy,
  Check,
  Trash2,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';

interface TunnelsPanelProps {
  host?: RemoteHost;
}

export const TunnelsPanel = ({ host }: TunnelsPanelProps) => {
  const tunnelsQuery = useTunnels();
  const remoteState = useRemoteState();
  const openTunnel = useOpenTunnel();
  const closeTunnel = useCloseTunnel();
  const removeTunnel = useRemoveTunnel();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const hosts = useMemo(() => remoteState.data?.hosts ?? [], [remoteState.data?.hosts]);

  const hostsById = useMemo(() => {
    const map = new Map<string, RemoteHost>();
    for (const h of hosts) {
      map.set(h.id, h);
    }
    return map;
  }, [hosts]);

  const filteredTunnels = useMemo(() => {
    const all = tunnelsQuery.data ?? [];
    if (!host) return all;
    return all.filter((t) => t.config.hostId === host.id);
  }, [tunnelsQuery.data, host]);

  const handleCopy = (status: TunnelStatus) => {
    void navigator.clipboard.writeText(status.connectionTemplate);
    setCopiedId(status.config.id);
    setTimeout(() => {
      setCopiedId((curr) => (curr === status.config.id ? null : curr));
    }, 2000);
  };

  const handleToggle = (status: TunnelStatus) => {
    if (status.state.state === 'open') {
      closeTunnel.mutate(status.config.id);
    } else {
      openTunnel.mutate(status.config.id);
    }
  };

  const handleDelete = (id: string) => {
    removeTunnel.mutate(id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-base font-semibold text-foreground">SSH Port Tunnels</h3>
          <p className="font-sans text-xs text-muted-foreground">
            Forward local loopback ports (127.0.0.1) securely to remote targets. Reuses
            ControlMaster when active.
          </p>
        </div>
        <Button variant="glass" size="sm" onClick={() => setDialogOpen(true)} className="shrink-0">
          <Plus className="size-3.5" />
          New Tunnel
        </Button>
      </div>

      {filteredTunnels.length === 0 ? (
        <EmptyState
          icon={<Network className="size-10" />}
          title="No SSH tunnels"
          description={
            host
              ? `No tunnels configured for ${host.label}. Forward local ports to databases, caches, or internal APIs securely over SSH.`
              : 'No tunnels configured. Forward local ports to remote databases or services without exposing them to the internet.'
          }
          action={
            <Button variant="ember" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="size-3.5" />
              Create Tunnel
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filteredTunnels.map((t) => {
            const targetHost = hostsById.get(t.config.hostId);
            const isOpen = t.state.state === 'open';
            const isReconnecting = t.state.state === 'reconnecting';
            const isFailed = t.state.state === 'failed';
            const isCopied = copiedId === t.config.id;

            return (
              <div
                key={t.config.id}
                className={cn(
                  'sr-glass flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border p-4 transition-colors',
                  isOpen && 'border-primary/40 bg-primary/5',
                )}
              >
                <div className="flex min-w-[240px] items-center gap-3.5">
                  <div
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground',
                      isOpen && 'border-primary/50 bg-primary/10 text-primary',
                      isFailed && 'border-destructive/50 bg-destructive/10 text-destructive',
                    )}
                  >
                    <Network className="size-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-semibold text-foreground">
                        {t.config.name}
                      </span>
                      {targetHost && !host && (
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                          {targetHost.label}
                        </span>
                      )}
                      {targetHost?.env === 'prod' && (
                        <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-destructive uppercase">
                          PROD
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        127.0.0.1:{t.config.localPort}
                      </span>
                      <ArrowRight className="size-3 text-muted-foreground/60" />
                      <span>
                        {t.config.remoteHost}:{t.config.remotePort}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2.5">
                  {isOpen ? (
                    <Badge tone="success" dot size="sm">
                      {t.isMultiplexed ? 'Multiplexed' : 'Active'}
                    </Badge>
                  ) : isReconnecting ? (
                    <Badge tone="warning" size="sm">
                      <Spinner className="mr-1 size-3 text-current" />
                      Reconnecting
                    </Badge>
                  ) : isFailed ? (
                    <Badge
                      tone="danger"
                      size="sm"
                      title={t.state.state === 'failed' ? t.state.reason : ''}
                    >
                      <AlertTriangle className="mr-1 size-3" />
                      Failed
                    </Badge>
                  ) : (
                    <Badge tone="neutral" size="sm">
                      Stopped
                    </Badge>
                  )}

                  <Button
                    variant="glass"
                    size="sm"
                    title={t.connectionTemplate}
                    onClick={() => handleCopy(t)}
                  >
                    {isCopied ? (
                      <>
                        <Check className="size-3.5 text-success" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5" />
                        Copy String
                      </>
                    )}
                  </Button>

                  <Button
                    variant={isOpen ? 'secondary' : 'ember'}
                    size="sm"
                    disabled={openTunnel.isPending || closeTunnel.isPending}
                    onClick={() => handleToggle(t)}
                  >
                    {isOpen ? (
                      <>
                        <Square className="size-3.5" />
                        Stop
                      </>
                    ) : (
                      <>
                        <Play className="size-3.5" />
                        Start
                      </>
                    )}
                  </Button>

                  <Button
                    variant="glass"
                    size="iconSm"
                    aria-label="Delete tunnel"
                    title="Delete tunnel"
                    disabled={removeTunnel.isPending}
                    onClick={() => handleDelete(t.config.id)}
                  >
                    <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddTunnelDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        hosts={hosts}
        defaultHostId={host?.id}
      />
    </div>
  );
};
