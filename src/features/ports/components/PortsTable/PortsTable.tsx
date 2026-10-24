import { toast } from 'sonner';
import { useCallback, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ExternalLink, Star, Trash2 } from 'lucide-react';
import { DataTable } from '@/shared/ui/DataTable';
import { Button } from '@/shared/ui/Button';
import { formatBytes, formatPercent } from '@/shared/lib/format';
import { ProcessCell } from '@/features/ports/components/ProcessCell';
import { KillConfirmDialog } from '@/features/ports/components/KillConfirmDialog';
import type { PortDto } from '@/features/ports/api/ports.schema';
import { cn } from '@/shared/lib/cn';
import { ipc, ipcVoid, CMD } from '@/shared/tauri';
import { z } from 'zod';
import { useAppDispatch, useAppSelector } from '@/shared/state/hooks';
import { toggleFavoritePort } from '@/shared/state/settingsSlice';

function buildColumns(
  onKill: (p: PortDto) => void,
  favorites: number[],
  toggleFavorite: (port: number) => void,
): ColumnDef<PortDto, unknown>[] {
  return [
    {
      id: 'favorite',
      header: '',
      size: 40,
      enableSorting: false,
      cell: ({ row }) => {
        const isFav = favorites.includes(row.original.port);
        return (
          <button
            type="button"
            aria-label={
              isFav ? `Unfavorite port ${row.original.port}` : `Favorite port ${row.original.port}`
            }
            className="cursor-pointer p-1 text-muted-foreground transition-colors hover:text-warning"
            onClick={() => toggleFavorite(row.original.port)}
          >
            <Star
              className={cn(
                'size-3.5',
                isFav ? 'fill-warning text-warning' : 'fill-none opacity-40 hover:opacity-100',
              )}
            />
          </button>
        );
      },
    },
    {
      id: 'process',
      header: 'Process',
      size: 240,
      meta: { grow: true },
      accessorFn: (r) => r.command,
      cell: ({ row }) => (
        <ProcessCell
          command={row.original.command}
          user={row.original.user}
          detached={row.original.detached}
          project={row.original.project}
        />
      ),
    },
    {
      accessorKey: 'port',
      header: 'Port',
      size: 90,
      meta: { align: 'right' },
      cell: (c) => (
        <span className="font-medium text-fg tabular-nums">:{c.getValue<number>()}</span>
      ),
    },
    {
      accessorKey: 'pid',
      header: 'PID',
      size: 80,
      meta: { align: 'right' },
      cell: (c) => (
        <span className="text-muted-foreground tabular-nums">{c.getValue<number>()}</span>
      ),
    },
    {
      accessorKey: 'cpu',
      header: 'CPU',
      size: 72,
      meta: { align: 'right' },
      cell: (c) => (
        <span className="text-muted-foreground tabular-nums">
          {formatPercent(c.getValue<number | null>())}
        </span>
      ),
    },
    {
      accessorKey: 'memoryBytes',
      header: 'Mem',
      size: 84,
      meta: { align: 'right' },
      cell: (c) => (
        <span className="text-muted-foreground tabular-nums">
          {formatBytes(c.getValue<number | null>())}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      size: 96,
      enableSorting: false,
      meta: { align: 'right' },
      cell: ({ row }) => {
        const isSystem = row.original.pid < 2;
        const port = row.original.port;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Open http://127.0.0.1:${port} in browser`}
              title="Open in browser"
              onClick={async () => {
                try {
                  const isHttp = await ipc(CMD.PROBE_PORT_HTTP, { port }, z.boolean());
                  if (isHttp) {
                    await ipcVoid(CMD.OPEN_IN_BROWSER, { url: `http://127.0.0.1:${port}` });
                  } else {
                    toast.info(`:${port} didn't answer HTTP — it's probably not a web server.`);
                  }
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : `Couldn't open :${port}`);
                }
              }}
            >
              <ExternalLink className="size-3.5" />
            </Button>
            <Button
              variant="dangerGhost"
              size="icon"
              disabled={isSystem}
              aria-label={`Kill ${row.original.command}`}
              title={isSystem ? 'Cannot kill a system process' : 'Kill process'}
              onClick={() => onKill(row.original)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        );
      },
    },
  ];
}

export const PortsTable = ({ ports }: { ports: PortDto[] }) => {
  const dispatch = useAppDispatch();
  const [killTarget, setKillTarget] = useState<PortDto | null>(null);
  const favorites = useAppSelector((state) => state.settings.favoritePorts);

  const toggleFavorite = useCallback(
    (port: number) => {
      dispatch(toggleFavoritePort(port));
    },
    [dispatch],
  );

  const sortedPorts = useMemo(() => {
    return [...ports].sort((a, b) => {
      const aFav = favorites.includes(a.port);
      const bFav = favorites.includes(b.port);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return a.port - b.port;
    });
  }, [ports, favorites]);

  const columns = useMemo(
    () => buildColumns(setKillTarget, favorites, toggleFavorite),
    [favorites, toggleFavorite],
  );

  return (
    <>
      <DataTable
        data={sortedPorts}
        columns={columns}
        getRowId={(r) => `${r.pid}-${r.port}`}
        estimateRowHeight={52}
        emptyMessage="No listening ports found."
      />
      <KillConfirmDialog
        key={killTarget?.pid ?? 'none'}
        target={killTarget}
        onClose={() => setKillTarget(null)}
      />
    </>
  );
};
