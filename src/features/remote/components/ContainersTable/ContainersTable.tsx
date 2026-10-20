import type { ColumnDef } from '@tanstack/react-table';
import { Container as ContainerIcon } from 'lucide-react';
import { DataTable } from '@/shared/ui/DataTable';
import { EmptyState } from '@/shared/ui/EmptyState';
import { chipStyles, dotStyles } from '@/shared/ui/StatusChip/StatusChip.styles';
import { formatBytes, formatPercent } from '@/shared/lib/format';
import type { Container, HostSnapshot, RemoteHost } from '@/features/remote/api/remote.schema';
import { ContainerMenu } from '@/features/remote/components/ContainerMenu';
import { containerChip } from './ContainersTable.config';

const DOCKER_EMPTY: Record<
  Exclude<HostSnapshot['docker']['state'], 'ok'>,
  { title: string; description: string }
> = {
  absent: { title: 'Docker isn’t installed', description: 'No docker command on this server.' },
  noPermission: {
    title: 'Docker isn’t readable by your user',
    description:
      'Your SSH user isn’t in the docker group. The Issues tab says how to add it, and what that grants.',
  },
  daemonDown: {
    title: 'Docker isn’t running',
    description: 'The docker command exists, but its daemon didn’t answer.',
  },
};

const baseColumns: ColumnDef<Container>[] = [
  {
    id: 'name',
    header: 'Container',
    accessorKey: 'name',
    size: 260,
    meta: { grow: true },
    cell: ({ row: { original: c } }) => (
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-fg" title={c.name}>
          {c.name}
        </p>
        <p className="truncate text-xs text-fg-subtle" title={c.image}>
          {c.image}
          {c.composeProject && ` · ${c.composeProject}`}
        </p>
      </div>
    ),
  },
  {
    id: 'state',
    header: 'State',
    accessorFn: (c) => containerChip(c).label,
    size: 140,
    cell: ({ row: { original: c } }) => {
      const chip = containerChip(c);
      return (
        <span className={chipStyles({ status: chip.status })} title={c.status}>
          <span className={dotStyles({ status: chip.status })} />
          {chip.label}
        </span>
      );
    },
  },
  {
    id: 'cpu',
    header: 'CPU',
    accessorFn: (c) => c.cpuPct ?? -1,
    size: 80,
    meta: { align: 'right' },
    cell: ({ row: { original: c } }) => (
      <span className="text-sm text-fg-muted tabular-nums">{formatPercent(c.cpuPct)}</span>
    ),
  },
  {
    id: 'mem',
    header: 'Memory',
    accessorFn: (c) => c.memBytes ?? -1,
    size: 90,
    meta: { align: 'right' },
    cell: ({ row: { original: c } }) => (
      <span className="text-sm text-fg-muted tabular-nums">{formatBytes(c.memBytes)}</span>
    ),
  },
  {
    id: 'restarts',
    header: 'Restarts',
    accessorKey: 'restartCount',
    size: 90,
    meta: { align: 'right' },
    cell: ({ getValue }) => (
      <span className="text-sm text-fg-muted tabular-nums">{getValue<number>()}</span>
    ),
  },
];

export const ContainersTable = ({
  host,
  snapshot,
}: {
  host: RemoteHost;
  snapshot: HostSnapshot;
}) => {
  const { state } = snapshot.docker;
  if (state !== 'ok') {
    return <EmptyState icon={<ContainerIcon className="h-8 w-8" />} {...DOCKER_EMPTY[state]} />;
  }
  return (
    <div className="min-h-0 flex-1">
      <DataTable
        data={snapshot.containers}
        columns={[
          ...baseColumns,
          {
            id: 'actions',
            header: '',
            size: 52,
            enableSorting: false,
            meta: { align: 'right' },
            cell: ({ row: { original: c } }) => <ContainerMenu host={host} container={c} />,
          },
        ]}
        getRowId={(c) => c.id}
        estimateRowHeight={52}
        emptyMessage="No containers on this server."
      />
    </div>
  );
};
