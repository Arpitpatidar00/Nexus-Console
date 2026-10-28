import { useState } from 'react';
import { Badge } from '@/shared/ui/Badge';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { Skeleton } from '@/shared/ui/Skeleton';
import { formatBytes } from '@/shared/lib/format';
import { useKafkaGroups, useKafkaTopicDetail } from '../../api/useKafka';
import type { TopicDetail as TopicDetailData } from '../../api/kafka.schema';
import { formatCount, groupStatus } from '../../utils/format';
import { ConfigTable } from '../ConfigTable';
import { MessageBrowser } from '../MessageBrowser';
import { Warnings } from '../Warnings';

type View = 'messages' | 'partitions' | 'config' | 'consumers';

const ids = (xs: number[]) => (xs.length ? xs.join(', ') : '—');

const Partitions = ({ detail }: { detail: TopicDetailData }) => (
  <div className="min-h-0 flex-1 overflow-auto p-4">
    <table className="w-full rounded-lg border border-hairline text-xs">
      <thead className="sticky top-0 bg-popover/90 backdrop-blur-md">
        <tr className="border-b border-hairline text-left text-muted-foreground">
          <th className="px-3 py-2 font-medium">Partition</th>
          <th className="px-3 py-2 font-medium">Leader</th>
          <th className="px-3 py-2 font-medium">Replicas</th>
          <th className="px-3 py-2 font-medium">In sync</th>
          <th className="px-3 py-2 text-right font-medium">Start offset</th>
          <th className="px-3 py-2 text-right font-medium">End offset</th>
          <th className="px-3 py-2 text-right font-medium">Messages</th>
          <th className="px-3 py-2 text-right font-medium">Size</th>
          <th className="px-3 py-2 font-medium">Status</th>
        </tr>
      </thead>
      <tbody className="font-mono">
        {detail.partitions.map((p) => {
          const behind = p.replicas.filter((r) => !p.isr.includes(r));
          return (
            <tr key={p.partition} className="border-b border-hairline last:border-0">
              <td className="px-3 py-2">{p.partition}</td>
              <td className="px-3 py-2">
                {p.leader ?? <span className="text-destructive">none</span>}
                {p.leader !== null && p.replicas[0] !== p.leader && (
                  <span
                    className="ml-1 font-sans text-[10px] text-info"
                    title="Not the preferred (first) replica"
                  >
                    not preferred
                  </span>
                )}
              </td>
              <td className="px-3 py-2">{ids(p.replicas)}</td>
              <td className="px-3 py-2">{ids(p.isr)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{p.low ?? '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{p.high ?? '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCount(p.messages)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatBytes(p.sizeBytes)}</td>
              <td className="px-3 py-2 font-sans">
                {p.error ? (
                  <span className="text-destructive">{p.error}</span>
                ) : p.leader === null ? (
                  <Badge tone="destructive" size="sm">
                    offline
                  </Badge>
                ) : behind.length > 0 ? (
                  <Badge tone="warning" size="sm">
                    {behind.join(', ')} out of sync
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">in sync</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const Consumers = ({
  clusterId,
  topic,
  onOpenGroup,
}: {
  clusterId: string;
  topic: string;
  onOpenGroup: (group: string) => void;
}) => {
  const q = useKafkaGroups(clusterId);
  if (q.error) {
    return (
      <div className="p-5">
        <ErrorPanel
          error={q.error}
          fallback="Couldn't list consumer groups"
          onRetry={() => void q.refetch()}
        />
      </div>
    );
  }
  if (!q.data)
    return (
      <div className="p-5">
        <Skeleton lines={4} />
      </div>
    );
  const reading = q.data.groups
    .map((g) => ({ g, t: g.topics.find((t) => t.topic === topic) }))
    .filter((x) => x.t);
  if (reading.length === 0) {
    return (
      <p className="p-8 text-center text-xs text-muted-foreground">
        No consumer group has committed offsets for this topic.
      </p>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <table className="w-full rounded-lg border border-hairline text-xs">
        <thead>
          <tr className="border-b border-hairline text-left text-muted-foreground">
            <th className="px-3 py-2 font-medium">Group</th>
            <th className="px-3 py-2 font-medium">State</th>
            <th className="px-3 py-2 text-right font-medium">Members</th>
            <th className="px-3 py-2 text-right font-medium">Partitions</th>
            <th className="px-3 py-2 text-right font-medium">Lag on this topic</th>
          </tr>
        </thead>
        <tbody>
          {reading.map(({ g, t }) => {
            const s = groupStatus(g);
            return (
              <tr
                key={g.groupId}
                className="border-b border-hairline last:border-0 hover:bg-accent"
              >
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="cursor-pointer font-mono hover:text-ember-text hover:underline"
                    onClick={() => onOpenGroup(g.groupId)}
                  >
                    {g.groupId}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={s.tone} size="sm" dot>
                    {s.label}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{g.members ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t!.partitions}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {formatCount(t!.lag)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export const TopicDetail = ({
  clusterId,
  topic,
  onOpenGroup,
}: {
  clusterId: string;
  topic: string;
  onOpenGroup: (group: string) => void;
}) => {
  const q = useKafkaTopicDetail(clusterId, topic);
  const [view, setView] = useState<View>('messages');
  const d = q.data;

  const totals = d
    ? d.partitions.reduce(
        (acc, p) => ({
          messages: acc.messages !== null && p.messages !== null ? acc.messages + p.messages : null,
          size: acc.size !== null && p.sizeBytes !== null ? acc.size + p.sizeBytes : null,
        }),
        { messages: 0 as number | null, size: 0 as number | null },
      )
    : null;
  const overrides = d?.configs.filter((c) => !c.isDefault) ?? [];
  const policy = d?.configs.find((c) => c.name === 'cleanup.policy')?.value;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline px-4 py-2.5">
        <SegmentedControl<View>
          ariaLabel="Topic view"
          value={view}
          onChange={setView}
          options={[
            { value: 'messages', label: 'Messages' },
            { value: 'partitions', label: 'Partitions' },
            { value: 'config', label: 'Configuration' },
            { value: 'consumers', label: 'Consumers' },
          ]}
        />
        {d && totals && (
          <span className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
            <span>{d.partitions.length} partitions</span>
            <span>RF {Math.max(0, ...d.partitions.map((p) => p.replicas.length))}</span>
            <span>≈ {formatCount(totals.messages)} messages</span>
            {totals.size !== null && <span>{formatBytes(totals.size)}</span>}
            {policy && <span>cleanup: {policy}</span>}
            {overrides.length > 0 && <span>{overrides.length} config overrides</span>}
          </span>
        )}
      </div>

      {q.error ? (
        <div className="p-5">
          <ErrorPanel
            error={q.error}
            fallback="Couldn't read this topic"
            onRetry={() => void q.refetch()}
          />
        </div>
      ) : !d ? (
        <div className="p-5">
          <Skeleton lines={8} />
        </div>
      ) : (
        <>
          {d.warnings.length > 0 && (
            <div className="px-4 pt-3">
              <Warnings warnings={d.warnings} />
            </div>
          )}
          {view === 'messages' ? (
            <MessageBrowser
              key={topic}
              clusterId={clusterId}
              topic={topic}
              partitions={d.partitions.map((p) => p.partition)}
            />
          ) : view === 'partitions' ? (
            <Partitions detail={d} />
          ) : view === 'config' ? (
            <div className="flex min-h-0 flex-1 flex-col p-4">
              {d.configsError ? (
                <ErrorPanel
                  error={new Error(d.configsError)}
                  fallback="Couldn't read the topic configuration"
                />
              ) : (
                <ConfigTable configs={d.configs} />
              )}
            </div>
          ) : (
            <Consumers clusterId={clusterId} topic={topic} onOpenGroup={onOpenGroup} />
          )}
        </>
      )}
    </div>
  );
};
