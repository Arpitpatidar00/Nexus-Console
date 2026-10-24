import { useState } from 'react';
import { ChevronRight, Network, Plus, RotateCw, Search, Trash2, Zap } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/Button';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Skeleton } from '@/shared/ui/Skeleton';
import type { DbConnection, DiscoveredDb } from '@/features/databases/api/databases.schema';
import type { DbSchema } from '@/features/databases/api/explorer.schema';
import { keyOf } from '@/features/databases/utils/relations';

const ENGINE_SHORT: Record<string, string> = {
  postgres: 'PG',
  mysql: 'MY',
  mongodb: 'MG',
  mongo: 'MG',
  redis: 'RD',
};

interface Props {
  connections: DbConnection[];
  discovered: DiscoveredDb[];
  selectedId: string | null;
  schema: {
    data?: DbSchema;
    isLoading: boolean;
    isFetching: boolean;
    error: unknown;
    refetch: () => void;
  };
  activeTable: string | null;
  mapOpen: boolean;
  onSelect: (id: string) => void;
  onOpenTable: (key: string) => void;
  onOpenMap: () => void;
  onAdd: () => void;
  onQuickAdd: (d: DiscoveredDb) => void;
  onRemove: (id: string) => void;
}

/** Connections, and under the open one its tables — the Compass tree. */
export const ExplorerSidebar = ({
  connections,
  discovered,
  selectedId,
  schema,
  activeTable,
  mapOpen,
  onSelect,
  onOpenTable,
  onOpenMap,
  onAdd,
  onQuickAdd,
  onRemove,
}: Props) => {
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();
  const s = schema.data;
  const tables = (s?.tables ?? []).filter((t) => !q || keyOf(t).toLowerCase().includes(q));
  const bySchema = new Map<string, typeof tables>();
  for (const t of tables) bySchema.set(t.schema, [...(bySchema.get(t.schema) ?? []), t]);
  const unconnected = discovered.filter(
    (d) =>
      !connections.some(
        (c) => c.port === d.port && (c.host === '127.0.0.1' || c.host === 'localhost'),
      ),
  );

  return (
    <nav aria-label="Databases" className="flex w-64 shrink-0 flex-col border-r border-hairline">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-hairline px-3">
        <span className="text-sm font-semibold text-fg">Databases</span>
        <span className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Map of all databases"
            title="Map of all databases"
            disabled={connections.length === 0}
            onClick={onOpenMap}
            className={cn(mapOpen && 'bg-accent')}
          >
            <Network />
          </Button>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Add a connection"
            title="Add a connection"
            onClick={onAdd}
          >
            <Plus />
          </Button>
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {unconnected.length > 0 && (
          <div className="mx-2 mb-2 rounded-lg border border-hairline px-2.5 py-2">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Zap className="size-3 text-warning" aria-hidden />
              Running on this Mac
            </p>
            {unconnected.map((d) => (
              <div key={d.port} className="mt-1 flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-fg">
                  {d.name} <span className="text-muted-foreground">:{d.port}</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => onQuickAdd(d)}
                >
                  Add
                </Button>
              </div>
            ))}
          </div>
        )}

        {connections.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            No connections yet. Add one with +, or paste a DATABASE_URL.
          </p>
        )}

        {connections.map((c) => {
          const open = c.id === selectedId && !mapOpen;
          return (
            <div key={c.id} className="px-2">
              <div
                className={cn(
                  'group flex items-center gap-2 rounded-md px-2 py-1.5',
                  open ? 'bg-accent' : 'hover:bg-accent',
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                >
                  <ChevronRight
                    className={cn(
                      'size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
                      open && 'rotate-90',
                    )}
                  />
                  <span className="w-6 shrink-0 rounded bg-muted text-center text-[9px] font-bold text-muted-foreground">
                    {ENGINE_SHORT[c.driver] ?? '··'}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-fg">{c.name}</span>
                    <span className="block truncate font-mono text-[10px] text-muted-foreground">
                      {c.database ? `${c.database} · ` : ''}
                      {c.host}
                    </span>
                  </span>
                </button>
                {c.env === 'prod' && (
                  <span className="rounded bg-danger-soft px-1 text-[9px] font-bold text-destructive">
                    PROD
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${c.name}`}
                  title="Remove connection"
                  onClick={() => onRemove(c.id)}
                  className="cursor-pointer rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>

              {open && (
                <div className="mb-2 ml-3 border-l border-hairline pl-2">
                  {schema.error ? (
                    <div className="py-2 pr-1">
                      <ErrorPanel
                        error={schema.error}
                        fallback="Couldn't read this database"
                        onRetry={schema.refetch}
                      />
                    </div>
                  ) : schema.isLoading ? (
                    <Skeleton lines={6} className="pr-2" />
                  ) : (
                    <>
                      <div className="flex items-center gap-1 py-1 pr-1">
                        <label className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md bg-muted px-2">
                          <Search className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                          <input
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            placeholder={`${s?.tables.length ?? 0} ${s?.engine === 'redis' ? 'prefixes' : s?.engine?.startsWith('mongo') ? 'collections' : 'tables'}`}
                            aria-label="Filter tables"
                            className="min-w-0 flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-muted-foreground"
                          />
                        </label>
                        <Button
                          variant="ghost"
                          size="iconSm"
                          className="size-7"
                          aria-label="Reload schema"
                          title="Reload schema"
                          disabled={schema.isFetching}
                          onClick={schema.refetch}
                        >
                          <RotateCw
                            className={cn(
                              'size-3.5',
                              schema.isFetching && 'animate-spin motion-reduce:animate-none',
                            )}
                          />
                        </Button>
                      </div>
                      {[...bySchema.entries()].map(([name, list]) => (
                        <div key={name}>
                          {bySchema.size > 1 && (
                            <p className="px-2 pt-1.5 pb-0.5 text-[11px] font-medium text-muted-foreground">
                              {name}
                            </p>
                          )}
                          {list.map((t) => {
                            const key = keyOf(t);
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => onOpenTable(key)}
                                aria-current={activeTable === key ? 'page' : undefined}
                                className={cn(
                                  'flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1 text-left',
                                  activeTable === key
                                    ? 'bg-ember-soft text-ember-text'
                                    : 'text-fg hover:bg-accent',
                                )}
                              >
                                <span
                                  className={cn(
                                    'truncate font-mono text-xs',
                                    t.kind !== 'table' &&
                                      t.kind !== 'collection' &&
                                      t.kind !== 'keyspace' &&
                                      'italic',
                                  )}
                                >
                                  {t.name}
                                </span>
                                {t.rowEstimate != null && t.rowEstimate > 0 && (
                                  <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                                    {t.rowEstimate >= 1000
                                      ? `${Math.round(t.rowEstimate / 100) / 10}k`
                                      : t.rowEstimate}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                      {tables.length === 0 && (
                        <p className="px-2 py-2 text-xs text-muted-foreground">
                          {q ? 'No match.' : 'Empty database.'}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
};
