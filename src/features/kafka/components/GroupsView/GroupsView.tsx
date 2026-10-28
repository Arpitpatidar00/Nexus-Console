import { useId, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { Badge } from '@/shared/ui/Badge';
import { DataTable } from '@/shared/ui/DataTable';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Input } from '@/shared/ui/Field';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Switch } from '@/shared/ui/Switch';
import { useKafkaGroups } from '../../api/useKafka';
import type { GroupSummary } from '../../api/kafka.schema';
import { formatCount, groupStatus } from '../../utils/format';
import { Warnings } from '../Warnings';

type StateFilter = 'all' | 'active' | 'inactive';
const col = createColumnHelper<GroupSummary>();

export const GroupsView = ({
  clusterId,
  onOpen,
}: {
  clusterId: string;
  onOpen: (group: string) => void;
}) => {
  const switchId = useId();
  const [live, setLive] = useState(false);
  const q = useKafkaGroups(clusterId, live);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StateFilter>('all');

  const columns = [
    col.accessor('groupId', {
      header: 'Group',
      size: 260,
      meta: { grow: true },
      cell: (c) => (
        <button
          type="button"
          onClick={() => onOpen(c.getValue())}
          className="max-w-full cursor-pointer truncate text-left font-mono text-fg hover:text-ember-text hover:underline"
          title={c.getValue()}
        >
          {c.getValue()}
        </button>
      ),
    }),
    col.accessor('state', {
      header: 'State',
      size: 170,
      cell: (c) => {
        const s = groupStatus(c.row.original);
        return (
          <Badge tone={s.tone} size="sm" dot>
            {s.label}
          </Badge>
        );
      },
    }),
    col.accessor((g) => g.members ?? -1, {
      id: 'members',
      header: 'Members',
      size: 90,
      meta: { align: 'right' },
      cell: (c) => <span className="tabular-nums">{c.row.original.members ?? '—'}</span>,
    }),
    col.accessor((g) => g.topics.map((t) => t.topic).join(', '), {
      id: 'topics',
      header: 'Topics',
      size: 220,
      cell: (c) => (
        <span className="block truncate text-muted-foreground" title={c.getValue()}>
          {c.getValue() ||
            (c.row.original.error ? (
              <span className="text-destructive">{c.row.original.error}</span>
            ) : (
              '—'
            ))}
        </span>
      ),
    }),
    col.accessor((g) => g.totalLag ?? -1, {
      id: 'lag',
      header: 'Lag',
      size: 110,
      meta: { align: 'right' },
      cell: (c) => (
        <span
          className="tabular-nums"
          title={
            c.row.original.totalLag !== null
              ? `${c.row.original.totalLag.toLocaleString('en-US')} messages behind the end of the log`
              : 'No committed offsets to compare'
          }
        >
          {formatCount(c.row.original.totalLag)}
        </span>
      ),
    }),
  ];

  if (q.error) {
    return (
      <div className="p-6">
        <ErrorPanel
          error={q.error}
          fallback="Couldn't list consumer groups"
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
  const rows = q.data.groups.filter((g) => {
    if (needle && !g.groupId.toLowerCase().includes(needle)) return false;
    if (filter === 'active') return g.state !== 'Empty' && g.state !== 'Dead';
    if (filter === 'inactive') return g.state === 'Empty' || g.state === 'Dead';
    return true;
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-2.5">
        <Input
          size="sm"
          type="search"
          className="w-72"
          aria-label="Filter consumer groups"
          placeholder="Filter groups"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <SegmentedControl<StateFilter>
          ariaLabel="Group state"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            id={switchId}
            checked={live}
            onChange={setLive}
            ariaLabel="Refresh lag every 10 seconds"
          />
          <label htmlFor={switchId} className="cursor-pointer">
            Live lag
          </label>
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {rows.length} group{rows.length === 1 ? '' : 's'}
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
        getRowId={(g) => g.groupId}
        estimateRowHeight={40}
        emptyMessage={
          q.data.groups.length === 0
            ? 'No consumer groups on this cluster.'
            : 'No group matches these filters.'
        }
      />
    </div>
  );
};
