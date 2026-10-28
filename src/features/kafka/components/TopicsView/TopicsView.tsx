import { useId, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { Badge } from '@/shared/ui/Badge';
import { DataTable } from '@/shared/ui/DataTable';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Input } from '@/shared/ui/Field';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Switch } from '@/shared/ui/Switch';
import { formatBytes } from '@/shared/lib/format';
import { useKafkaTopics } from '../../api/useKafka';
import type { TopicSummary } from '../../api/kafka.schema';
import { formatCount } from '../../utils/format';
import { Warnings } from '../Warnings';

const col = createColumnHelper<TopicSummary>();

const health = (t: TopicSummary) => {
  if (t.error) return <span className="text-destructive">{t.error}</span>;
  if (t.offline > 0)
    return (
      <Badge tone="destructive" size="sm">
        {t.offline} offline
      </Badge>
    );
  if (t.underReplicated > 0)
    return (
      <Badge tone="warning" size="sm">
        {t.underReplicated} under-replicated
      </Badge>
    );
  return null;
};

export const TopicsView = ({
  clusterId,
  onOpen,
}: {
  clusterId: string;
  onOpen: (topic: string) => void;
}) => {
  const q = useKafkaTopics(clusterId);
  const switchId = useId();
  const [query, setQuery] = useState('');
  const [showInternal, setShowInternal] = useState(false);

  const columns = [
    col.accessor('name', {
      header: 'Topic',
      size: 280,
      meta: { grow: true },
      cell: (c) => (
        <button
          type="button"
          onClick={() => onOpen(c.getValue())}
          className="max-w-full cursor-pointer truncate text-left font-mono text-fg hover:text-ember-text hover:underline"
          title={c.getValue()}
        >
          {c.getValue()}
          {c.row.original.internal && (
            <span className="ml-2 font-sans text-[10px] text-muted-foreground">internal</span>
          )}
        </button>
      ),
    }),
    col.accessor('partitions', {
      header: 'Partitions',
      size: 100,
      meta: { align: 'right' },
      cell: (c) => <span className="tabular-nums">{c.getValue()}</span>,
    }),
    col.accessor('replicationFactor', {
      header: 'Replicas',
      size: 90,
      meta: { align: 'right' },
      cell: (c) => <span className="tabular-nums">{c.getValue()}</span>,
    }),
    col.accessor((t) => t.messages ?? -1, {
      id: 'messages',
      header: 'Messages',
      size: 110,
      meta: { align: 'right' },
      cell: (c) => (
        <span
          className="tabular-nums"
          title={
            c.row.original.messages !== null
              ? `${c.row.original.messages.toLocaleString('en-US')} — end offset minus start offset; an upper bound on compacted topics`
              : undefined
          }
        >
          {formatCount(c.row.original.messages)}
        </span>
      ),
    }),
    col.accessor((t) => t.sizeBytes ?? -1, {
      id: 'size',
      header: 'Size',
      size: 100,
      meta: { align: 'right' },
      cell: (c) => <span className="tabular-nums">{formatBytes(c.row.original.sizeBytes)}</span>,
    }),
    col.display({
      id: 'health',
      header: 'Health',
      size: 170,
      cell: (c) => health(c.row.original),
    }),
  ];

  if (q.error) {
    return (
      <div className="p-6">
        <ErrorPanel
          error={q.error}
          fallback="Couldn't list topics"
          onRetry={() => void q.refetch()}
        />
      </div>
    );
  }
  if (!q.data) {
    return (
      <div className="p-5">
        <Skeleton lines={10} />
      </div>
    );
  }

  const needle = query.trim().toLowerCase();
  const internalCount = q.data.topics.filter((t) => t.internal).length;
  const rows = q.data.topics.filter(
    (t) => (showInternal || !t.internal) && (!needle || t.name.toLowerCase().includes(needle)),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-2.5">
        <Input
          size="sm"
          type="search"
          className="w-72"
          aria-label="Filter topics"
          placeholder="Filter topics"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {internalCount > 0 && (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              id={switchId}
              checked={showInternal}
              onChange={setShowInternal}
              ariaLabel="Show internal topics"
            />
            <label htmlFor={switchId} className="cursor-pointer">
              Internal ({internalCount})
            </label>
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {rows.length} topic{rows.length === 1 ? '' : 's'}
          {q.isFetching && ' · refreshing…'}
        </span>
      </div>
      {q.data.warnings.length > 0 && (
        <div className="px-4 pt-3">
          <Warnings warnings={q.data.warnings} />
        </div>
      )}
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(t) => t.name}
        estimateRowHeight={40}
        emptyMessage={
          q.data.topics.length === 0
            ? 'This cluster has no topics yet.'
            : needle
              ? `No topic matches “${query.trim()}”.`
              : 'Only internal topics here — switch them on to see them.'
        }
      />
    </div>
  );
};
