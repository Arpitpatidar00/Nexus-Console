import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/shared/ui/DataTable';
import type { HostSnapshot } from '@/features/remote/api/remote.schema';

type Port = HostSnapshot['ports'][number];

const ADDR_LABEL: Record<string, string> = {
  '0.0.0.0': 'All IPv4',
  '[::]': 'All IPv6',
  '*': 'All',
};

const columns: ColumnDef<Port>[] = [
  {
    id: 'port',
    header: 'Port',
    accessorKey: 'port',
    size: 90,
    meta: { align: 'right' },
    cell: ({ getValue }) => (
      <span className="font-mono text-sm text-fg tabular-nums">{getValue<number>()}</span>
    ),
  },
  {
    id: 'local',
    header: 'Listening on',
    accessorKey: 'local',
    size: 200,
    cell: ({ getValue }) => {
      const v = getValue<string>();
      return (
        <span className="text-sm text-fg-muted">
          {ADDR_LABEL[v] ?? <span className="font-mono">{v}</span>}
        </span>
      );
    },
  },
  {
    id: 'process',
    header: 'Process',
    accessorFn: (p) => p.process ?? '',
    size: 200,
    meta: { grow: true },
    cell: ({ row: { original: p } }) =>
      p.process ? (
        <span className="font-mono text-sm text-fg">{p.process}</span>
      ) : (
        <span
          className="text-sm text-fg-subtle"
          title="Process names of other users' sockets need root."
        >
          —
        </span>
      ),
  },
];

export const PortsPanel = ({ snapshot }: { snapshot: HostSnapshot }) => (
  <div className="min-h-0 flex-1">
    <DataTable
      data={snapshot.ports}
      columns={columns}
      getRowId={(p) => `${p.local}:${p.port}`}
      emptyMessage="No listening TCP ports reported."
    />
  </div>
);
