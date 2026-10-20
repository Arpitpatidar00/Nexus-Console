import { useMemo, useState } from 'react';
import { Network, RefreshCw, SearchX } from 'lucide-react';
import { usePorts } from '@/features/ports/api/usePorts';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Panel } from '@/shared/ui/Panel';
import { Button } from '@/shared/ui/Button';
import { SearchField } from '@/shared/ui/SearchField';
import { Switch } from '@/shared/ui/Switch';
import { PortsTable } from '@/features/ports/components/PortsTable';
import { PortsTableSkeleton } from '@/features/ports/components/PortsTableSkeleton';
import { cn } from '@/shared/lib/cn';

export const PortsPage = () => {
  const [query, setQuery] = useState('');
  const [listeningOnly, setListeningOnly] = useState(true);
  const { data, isPending, isError, error, isFetching, refetch } = usePorts(listeningOnly);

  const filtered = useMemo(() => {
    const rows = data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (p) =>
        p.command.toLowerCase().includes(q) ||
        String(p.port).includes(q) ||
        String(p.pid).includes(q) ||
        p.user.toLowerCase().includes(q),
    );
  }, [data, query]);

  const total = data?.length ?? 0;
  const subtitle = isPending
    ? 'Ports & processes'
    : query
      ? `${filtered.length} of ${total} shown`
      : `${total} ${listeningOnly ? 'listening' : 'active'} port${total === 1 ? '' : 's'}`;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Top action header */}
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-4">
        <p className="sr-caption tabular-nums">{subtitle}</p>

        <div className="flex items-center gap-3">
          <SearchField
            placeholder="Search port, process, PID..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 w-64 max-w-full"
          />

          <label
            htmlFor="ports-listening-only-toggle"
            className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground select-none"
          >
            <Switch
              id="ports-listening-only-toggle"
              checked={listeningOnly}
              onChange={setListeningOnly}
              ariaLabel="Listening ports only"
            />
            <span>Listening only</span>
          </label>

          <Button variant="glass" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Main Table panel */}
      <Panel className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-0">
        {isPending ? (
          <PortsTableSkeleton />
        ) : isError ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="rounded-lg border border-destructive/30 bg-danger-soft px-4 py-3 text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to list ports'}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={query ? <SearchX className="size-10" /> : <Network className="size-10" />}
            title={query ? 'No matches' : listeningOnly ? 'No listening ports' : 'No active ports'}
            description={
              query
                ? `Nothing matches “${query.trim()}”.`
                : listeningOnly
                  ? 'Nothing is listening right now. Apps that open a port will show up here.'
                  : 'No processes are holding a network connection.'
            }
          />
        ) : (
          <PortsTable ports={filtered} />
        )}
      </Panel>
    </div>
  );
};
