import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, RefreshCw, Waypoints } from 'lucide-react';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { Spinner } from '@/shared/ui/Spinner';
import { cn } from '@/shared/lib/cn';
import { kafkaKeys } from '../api/keys';
import { useKafkaClusters, useKafkaPing, useRemoveKafkaCluster } from '../api/useKafka';
import type { KafkaCluster } from '../api/kafka.schema';
import { ClusterDialog } from '../components/ClusterDialog';
import { ClusterOverview } from '../components/ClusterOverview';
import { ClusterSidebar } from '../components/ClusterSidebar';
import { GroupDetail } from '../components/GroupDetail';
import { GroupsView } from '../components/GroupsView';
import { TopicDetail } from '../components/TopicDetail';
import { TopicsView } from '../components/TopicsView';

type View = 'overview' | 'topics' | 'groups';
type Detail = { kind: 'topic' | 'group'; name: string };

const VIEW_LABEL: Record<View, string> = {
  overview: 'Overview',
  topics: 'Topics',
  groups: 'Consumer groups',
};

const ConnectionStatus = ({ id }: { id: string }) => {
  const ping = useKafkaPing(id);
  if (!ping.data) {
    return ping.isFetching ? <Spinner className="size-3.5 text-muted-foreground" /> : null;
  }
  const r = ping.data;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 text-[11px]',
        r.ok ? 'text-muted-foreground' : 'text-destructive',
      )}
      title={r.ok ? r.warnings.join('\n') || undefined : (r.error ?? undefined)}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          r.ok ? (r.warnings.length ? 'bg-warning' : 'bg-success') : 'bg-destructive',
        )}
      />
      {r.ok ? `${r.latencyMs} ms` : 'unreachable'}
    </span>
  );
};

export function KafkaPage() {
  const clustersQ = useKafkaClusters();
  const clusters = clustersQ.data ?? [];
  const remove = useRemoveKafkaCluster();
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>('topics');
  const [trail, setTrail] = useState<Detail[]>([]);
  const [dialog, setDialog] = useState<{ cluster: KafkaCluster | null } | null>(null);

  // A removed (or not yet chosen) cluster falls back to the first one.
  const active = clusters.find((c) => c.id === selectedId) ?? clusters[0] ?? null;
  const detail = trail.at(-1) ?? null;

  const select = (id: string) => {
    setSelectedId(id);
    setTrail([]);
  };
  const open = (d: Detail) =>
    setTrail((t) => (t.at(-1)?.kind === d.kind && t.at(-1)?.name === d.name ? t : [...t, d]));
  const refresh = () => {
    if (active) void queryClient.invalidateQueries({ queryKey: kafkaKeys.cluster(active.id) });
  };

  return (
    <div className="flex h-full overflow-hidden bg-canvas text-fg">
      {clusters.length > 0 && (
        <ClusterSidebar
          clusters={clusters}
          selectedId={active?.id ?? null}
          onSelect={select}
          onAdd={() => setDialog({ cluster: null })}
          onEdit={(c) => setDialog({ cluster: c })}
          onRemove={(c) =>
            remove.mutate(c.id, {
              onSuccess: () => {
                if (c.id === active?.id) {
                  setSelectedId(null);
                  setTrail([]);
                }
              },
            })
          }
        />
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        {clustersQ.error ? (
          <div className="p-6">
            <ErrorPanel
              error={clustersQ.error}
              fallback="Couldn't load your Kafka clusters."
              onRetry={() => void clustersQ.refetch()}
            />
          </div>
        ) : !clustersQ.data ? null : !active ? (
          <EmptyState
            icon={<Waypoints className="size-10" />}
            title="Explore a Kafka cluster"
            description="Add a cluster to see its brokers and topics, read messages, and watch consumer-group lag. Read-only: nothing is produced and no offsets are committed. Running Kafka locally? It's usually at localhost:9092."
            action={
              <Button variant="ember" size="sm" onClick={() => setDialog({ cluster: null })}>
                Add a cluster
              </Button>
            }
          />
        ) : (
          <>
            <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-hairline px-4">
              <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs">
                {detail && (
                  <Button
                    variant="ghost"
                    size="iconSm"
                    aria-label="Back"
                    onClick={() => setTrail((t) => t.slice(0, -1))}
                  >
                    <ArrowLeft />
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setTrail([]);
                    setView('overview');
                  }}
                  className={cn(
                    'cursor-pointer truncate font-semibold hover:underline',
                    detail ? 'text-muted-foreground hover:text-fg' : 'text-sm text-fg',
                  )}
                >
                  {active.name}
                </button>
                {detail && (
                  <>
                    <ChevronRight
                      className="size-3 shrink-0 text-muted-foreground/60"
                      aria-hidden
                    />
                    <button
                      type="button"
                      className="cursor-pointer text-muted-foreground hover:text-fg hover:underline"
                      onClick={() => {
                        setTrail([]);
                        setView(detail.kind === 'topic' ? 'topics' : 'groups');
                      }}
                    >
                      {detail.kind === 'topic' ? 'Topics' : 'Consumer groups'}
                    </button>
                    <ChevronRight
                      className="size-3 shrink-0 text-muted-foreground/60"
                      aria-hidden
                    />
                    <span
                      className="truncate font-mono text-sm font-semibold text-fg"
                      title={detail.name}
                    >
                      {detail.name}
                    </span>
                  </>
                )}
                {active.env === 'prod' && (
                  <Badge tone="prod" size="sm" className="ml-1 shrink-0">
                    PROD
                  </Badge>
                )}
                <span className="ml-1 shrink-0 rounded bg-success-soft px-1.5 text-[11px] font-medium text-success">
                  read-only
                </span>
                <span className="ml-1">
                  <ConnectionStatus id={active.id} />
                </span>
              </nav>
              <div className="flex shrink-0 items-center gap-2">
                {!detail && (
                  <SegmentedControl<View>
                    ariaLabel="Cluster view"
                    value={view}
                    onChange={setView}
                    options={(Object.keys(VIEW_LABEL) as View[]).map((v) => ({
                      value: v,
                      label: VIEW_LABEL[v],
                    }))}
                  />
                )}
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label="Refresh"
                  title="Refresh"
                  onClick={refresh}
                >
                  <RefreshCw />
                </Button>
              </div>
            </header>

            {detail?.kind === 'topic' ? (
              <TopicDetail
                key={`${active.id}:topic:${detail.name}`}
                clusterId={active.id}
                topic={detail.name}
                onOpenGroup={(name) => open({ kind: 'group', name })}
              />
            ) : detail?.kind === 'group' ? (
              <GroupDetail
                key={`${active.id}:group:${detail.name}`}
                clusterId={active.id}
                group={detail.name}
                onOpenTopic={(name) => open({ kind: 'topic', name })}
              />
            ) : view === 'overview' ? (
              <ClusterOverview key={active.id} clusterId={active.id} />
            ) : view === 'topics' ? (
              <TopicsView
                key={active.id}
                clusterId={active.id}
                onOpen={(name) => open({ kind: 'topic', name })}
              />
            ) : (
              <GroupsView
                key={active.id}
                clusterId={active.id}
                onOpen={(name) => open({ kind: 'group', name })}
              />
            )}
          </>
        )}
      </main>

      <ClusterDialog
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        cluster={dialog?.cluster ?? null}
        onSaved={(c) => select(c.id)}
      />
    </div>
  );
}
