import { useState } from 'react';
import { Boxes, Play, RotateCw, Square, Layers } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { EmptyState } from '@/shared/ui/EmptyState';
import type { HostSnapshot, RemoteHost, Container } from '@/features/remote/api/remote.schema';
import { useComposeAction } from '@/features/remote/api/useComposeAction';
import { ContainerMenu } from '@/features/remote/components/ContainerMenu';
import { ProdConfirmDialog } from '@/features/remote/components/ProdConfirmDialog';
import { formatBytes } from '@/shared/lib/format';

interface Props {
  host: RemoteHost;
  snapshot: HostSnapshot;
}

export const ComposeStacksView = ({ host, snapshot }: Props) => {
  const composeAction = useComposeAction(host.id);
  const [pendingAction, setPendingAction] = useState<{
    project: string;
    action: 'start' | 'stop' | 'restart';
  } | null>(null);

  // Group containers by composeProject
  const groups = new Map<string, Container[]>();
  for (const c of snapshot.containers) {
    const key = c.composeProject || 'ungrouped';
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }

  const handleAction = (project: string, action: 'start' | 'stop' | 'restart') => {
    if (host.env === 'prod' || action === 'stop') {
      setPendingAction({ project, action });
    } else {
      composeAction.mutate({ project, action });
    }
  };

  const executePending = () => {
    if (!pendingAction) return;
    composeAction.mutate(pendingAction);
    setPendingAction(null);
  };

  if (snapshot.containers.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <EmptyState
          icon={<Boxes className="h-8 w-8 text-fg-subtle" />}
          title="No containers found"
          description="This server does not have any active or stopped Docker containers."
        />
      </div>
    );
  }

  const entries = Array.from(groups.entries()).sort(([a], [b]) => {
    if (a === 'ungrouped') return 1;
    if (b === 'ungrouped') return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
      {entries.map(([project, containers]) => {
        const isUngrouped = project === 'ungrouped';
        const runningCount = containers.filter((c) => c.state === 'running').length;
        const allRunning = runningCount === containers.length;
        const someRunning = runningCount > 0 && !allRunning;

        return (
          <div
            key={project}
            className="bg-surface/50 flex flex-col overflow-hidden rounded-2xl border border-hairline shadow-sm backdrop-blur-sm"
          >
            {/* Stack Header */}
            <div className="flex items-center justify-between border-b border-hairline bg-muted/20 px-5 py-3.5">
              <div className="flex items-center gap-3">
                {isUngrouped ? (
                  <Layers className="size-5 text-muted-foreground" />
                ) : (
                  <Boxes className="size-5 text-primary" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-fg">
                      {isUngrouped ? 'Standalone Containers' : project}
                    </span>
                    <Badge variant={allRunning ? 'success' : someRunning ? 'warning' : 'neutral'}>
                      {runningCount}/{containers.length} running
                    </Badge>
                  </div>
                  <span className="text-xs text-fg-subtle">
                    {containers.length} {containers.length === 1 ? 'container' : 'containers'}
                  </span>
                </div>
              </div>

              {!isUngrouped && (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={composeAction.isPending}
                    onClick={() => handleAction(project, 'start')}
                    title="Start all containers in this stack"
                  >
                    <Play className="mr-1.5 size-3.5 text-emerald-500" />
                    Start
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={composeAction.isPending}
                    onClick={() => handleAction(project, 'restart')}
                    title="Restart all containers in this stack"
                  >
                    <RotateCw className="mr-1.5 size-3.5 text-amber-500" />
                    Restart
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={composeAction.isPending}
                    onClick={() => handleAction(project, 'stop')}
                    title="Stop all containers in this stack"
                  >
                    <Square className="mr-1.5 size-3.5 text-rose-500" />
                    Stop
                  </Button>
                </div>
              )}
            </div>

            {/* Containers List */}
            <div className="divide-y divide-hairline">
              {containers.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-muted/10"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className={`size-2.5 shrink-0 rounded-full ${
                        c.state === 'running'
                          ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                          : 'bg-rose-500'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-sm font-medium text-fg">
                          {c.name}
                        </span>
                        {c.health && (
                          <Badge
                            variant={
                              c.health === 'healthy'
                                ? 'success'
                                : c.health === 'starting'
                                  ? 'warning'
                                  : 'danger'
                            }
                          >
                            {c.health}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-fg-subtle">
                        <span className="truncate font-mono">{c.image}</span>
                        {c.ports && <span>• {c.ports}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {(c.cpuPct !== null || c.memBytes !== null) && (
                      <div className="text-right text-xs">
                        {c.cpuPct !== null && (
                          <span className="font-mono text-fg-muted">
                            {c.cpuPct.toFixed(1)}% CPU
                          </span>
                        )}
                        {c.memBytes !== null && (
                          <span className="ml-2 font-mono text-fg-subtle">
                            {formatBytes(c.memBytes)}
                          </span>
                        )}
                      </div>
                    )}
                    <ContainerMenu host={host} container={c} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {pendingAction && (
        <ProdConfirmDialog
          hostLabel={host.label}
          title={`${pendingAction.action.toUpperCase()} Compose Stack: ${pendingAction.project}`}
          description={`Are you sure you want to ${pendingAction.action} the compose project "${pendingAction.project}" on ${host.label}?`}
          actionLabel={`${pendingAction.action} Stack`}
          danger={pendingAction.action === 'stop'}
          onConfirm={executePending}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
};
