import { useState } from 'react';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { Badge } from '@/shared/ui/Badge';
import { Dialog } from '@/shared/ui/Dialog';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Skeleton } from '@/shared/ui/Skeleton';
import { formatBytes } from '@/shared/lib/format';
import { useKafkaBrokerConfigs, useKafkaOverview } from '../../api/useKafka';
import type { BrokerInfo } from '../../api/kafka.schema';
import { formatCount } from '../../utils/format';
import { ConfigTable } from '../ConfigTable';
import { Warnings } from '../Warnings';

const Fact = ({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <dt className="text-[11px] text-muted-foreground">{label}</dt>
    <dd
      className={
        mono
          ? 'truncate font-mono text-[13px] text-fg'
          : 'text-[13px] font-medium text-fg tabular-nums'
      }
    >
      {value}
    </dd>
  </div>
);

const BrokerConfigsDialog = ({
  clusterId,
  broker,
  onClose,
}: {
  clusterId: string;
  broker: BrokerInfo | null;
  onClose: () => void;
}) => {
  const q = useKafkaBrokerConfigs(clusterId, broker?.id ?? null);
  return (
    <Dialog
      open={broker !== null}
      onOpenChange={(o) => !o && onClose()}
      title={broker ? `Broker ${broker.id} configuration` : ''}
      description={broker ? `${broker.host}:${broker.port}` : undefined}
      size="xl"
    >
      <div className="flex h-[60vh] min-h-0 flex-col">
        {q.error ? (
          <ErrorPanel
            error={q.error}
            fallback="Couldn't read this broker's configuration"
            onRetry={() => void q.refetch()}
          />
        ) : q.data ? (
          <ConfigTable configs={q.data} overridesLabel="Only non-defaults" />
        ) : (
          <Skeleton lines={10} />
        )}
      </div>
    </Dialog>
  );
};

export const ClusterOverview = ({ clusterId }: { clusterId: string }) => {
  const q = useKafkaOverview(clusterId);
  const [broker, setBroker] = useState<BrokerInfo | null>(null);

  if (q.error) {
    return (
      <div className="p-6">
        <ErrorPanel
          error={q.error}
          fallback="Couldn't reach this cluster"
          onRetry={() => void q.refetch()}
        />
      </div>
    );
  }
  const o = q.data;
  if (!o) {
    return (
      <div className="p-6">
        <Skeleton lines={8} />
      </div>
    );
  }

  const issues = [
    o.offlinePartitions > 0 && {
      tone: 'destructive' as const,
      text: `${o.offlinePartitions} offline partition${o.offlinePartitions === 1 ? '' : 's'} — no leader, can't be read or written`,
    },
    o.underReplicatedPartitions > 0 && {
      tone: 'warning' as const,
      text: `${o.underReplicatedPartitions} under-replicated partition${o.underReplicatedPartitions === 1 ? '' : 's'} — a replica has fallen behind`,
    },
    o.nonPreferredLeaders > 0 && {
      tone: 'info' as const,
      text: `${o.nonPreferredLeaders} partition${o.nonPreferredLeaders === 1 ? ' is' : 's are'} not led by the preferred replica`,
    },
  ].filter(Boolean) as { tone: 'destructive' | 'warning' | 'info'; text: string }[];
  const kraft = o.features.some((f) => f.name === 'metadata.version');

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
      <dl className="grid grid-cols-2 gap-4 rounded-xl border border-hairline p-4 sm:grid-cols-3 lg:grid-cols-6">
        <Fact label="Cluster ID" value={o.clusterId ?? '—'} mono />
        <Fact
          label="Controller"
          value={o.controllerId !== null ? `Broker ${o.controllerId}` : '—'}
        />
        <Fact label="Brokers" value={o.brokers.length} />
        <Fact
          label="Topics"
          value={
            <>
              {formatCount(o.topicCount)}
              {o.internalTopicCount > 0 && (
                <span className="ml-1 font-normal text-muted-foreground">
                  +{o.internalTopicCount} internal
                </span>
              )}
            </>
          }
        />
        <Fact label="Partitions" value={formatCount(o.partitionCount)} />
        <Fact label="Metadata" value={kraft ? 'KRaft' : 'ZooKeeper or pre-3.3'} />
      </dl>

      <section aria-label="Partition health" className="flex flex-col gap-1.5">
        {issues.length === 0 ? (
          <p className="flex items-center gap-2 text-[13px] text-success">
            <CircleCheck className="size-4" aria-hidden /> Every partition has a leader and a full
            set of in-sync replicas.
          </p>
        ) : (
          issues.map((i) => (
            <p
              key={i.text}
              className={
                i.tone === 'destructive'
                  ? 'flex items-center gap-2 text-[13px] text-destructive'
                  : i.tone === 'warning'
                    ? 'flex items-center gap-2 text-[13px] text-warning'
                    : 'flex items-center gap-2 text-[13px] text-info'
              }
            >
              <TriangleAlert className="size-4 shrink-0" aria-hidden /> {i.text}
            </p>
          ))
        )}
      </section>

      <Warnings warnings={o.warnings} />

      <section aria-label="Brokers" className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold text-fg">Brokers</h2>
        <div className="overflow-x-auto rounded-lg border border-hairline">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-hairline text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">Address</th>
                <th className="px-3 py-2 font-medium">Rack</th>
                <th className="px-3 py-2 text-right font-medium">Leaders</th>
                <th className="px-3 py-2 text-right font-medium">Replicas</th>
                <th className="px-3 py-2 text-right font-medium">Data</th>
                <th className="px-3 py-2 text-right font-medium">Disk free</th>
                <th className="px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {o.brokers.map((b) => (
                <tr key={b.id} className="border-b border-hairline last:border-0 hover:bg-accent">
                  <td className="px-3 py-2 font-mono">
                    {b.id}
                    {b.isController && (
                      <Badge tone="info" size="sm" className="ml-2">
                        controller
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {b.host}:{b.port}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{b.rack ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCount(b.leaderCount)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCount(b.replicaCount)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" title={b.error ?? undefined}>
                    {b.sizeBytes !== null ? formatBytes(b.sizeBytes) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {b.diskUsableBytes !== null && b.diskTotalBytes
                      ? `${formatBytes(b.diskUsableBytes)} of ${formatBytes(b.diskTotalBytes)}`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="cursor-pointer text-ember-text hover:underline"
                      onClick={() => setBroker(b)}
                    >
                      Configuration
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {o.features.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Feature levels:{' '}
          {o.features.map((f) => (
            <span key={f.name} className="mr-3 font-mono">
              {f.name}={f.level}
            </span>
          ))}
        </p>
      )}

      <BrokerConfigsDialog clusterId={clusterId} broker={broker} onClose={() => setBroker(null)} />
    </div>
  );
};
