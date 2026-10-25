import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ChevronRight,
  FolderInput,
  FolderPlus,
  MoreHorizontal,
  MoreVertical,
  Network,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Trash2,
  Zap,
} from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/Button';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Skeleton } from '@/shared/ui/Skeleton';
import type {
  DbConnection,
  DbGroup,
  DiscoveredDb,
} from '@/features/databases/api/databases.schema';
import type { DbSchema } from '@/features/databases/api/explorer.schema';
import { keyOf } from '@/features/databases/utils/relations';
import { getEngineCapabilities } from '@/features/databases/utils/capabilities';

const ENGINE_SHORT: Record<string, string> = {
  postgres: 'PG',
  mysql: 'MY',
  mongodb: 'MG',
  mongo: 'MG',
  redis: 'RD',
};

const itemCls =
  'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs outline-none hover:bg-accent focus:bg-accent text-fg';

interface Props {
  groups: DbGroup[];
  connections: DbConnection[];
  discovered: DiscoveredDb[];
  selectedId: string | null;
  selectedGroupId: string | null;
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
  onOpenMap: (groupId?: string | null) => void;
  onAddConnection: (groupId?: string | null) => void;
  onEditConnection: (c: DbConnection) => void;
  onMoveConnection: (id: string, targetGroupId: string | null) => void;
  onQuickAdd: (d: DiscoveredDb) => void;
  onRemove: (id: string) => void;
  onCreateGroup: () => void;
  onEditGroup: (group: DbGroup) => void;
  onDeleteGroup: (group: DbGroup, connectionCount: number) => void;
}

export const ExplorerSidebar = ({
  groups,
  connections,
  discovered,
  selectedId,
  selectedGroupId,
  schema,
  activeTable,
  mapOpen,
  onSelect,
  onOpenTable,
  onOpenMap,
  onAddConnection,
  onEditConnection,
  onMoveConnection,
  onQuickAdd,
  onRemove,
  onCreateGroup,
  onEditGroup,
  onDeleteGroup,
}: Props) => {
  const [filter, setFilter] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (id: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

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

  const ungroupedConnections = connections.filter((c) => !c.groupId);

  const renderConnectionItem = (c: DbConnection) => {
    const open = c.id === selectedId && !mapOpen;
    return (
      <div key={c.id} className="px-2">
        <div
          className={cn(
            'group flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors',
            open ? 'bg-accent text-accent-foreground' : 'text-fg hover:bg-accent/70',
          )}
        >
          <button
            type="button"
            onClick={() => onSelect(c.id)}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
          >
            <ChevronRight
              className={cn(
                'size-3 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
                open && 'rotate-90',
              )}
            />
            <span className="w-5 shrink-0 rounded bg-muted text-center text-[9px] font-bold text-muted-foreground">
              {ENGINE_SHORT[c.driver] ?? '··'}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">{c.name}</span>
              <span className="block truncate font-mono text-[10px] text-muted-foreground">
                {c.database ? `${c.database} · ` : ''}
                {c.host}
              </span>
            </span>
          </button>

          {c.env === 'prod' && (
            <span className="shrink-0 rounded bg-destructive/15 px-1 text-[9px] font-bold text-destructive">
              PROD
            </span>
          )}

          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label={`Actions for ${c.name}`}
                className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg focus-visible:opacity-100"
              >
                <MoreVertical className="size-3.5" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                className="z-[var(--z-dropdown)] min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
              >
                <DropdownMenu.Item className={itemCls} onSelect={() => onEditConnection(c)}>
                  <Pencil className="size-3.5 text-muted-foreground" />
                  Edit Connection
                </DropdownMenu.Item>

                {groups.length > 0 && (
                  <DropdownMenu.Sub>
                    <DropdownMenu.SubTrigger className={itemCls}>
                      <FolderInput className="size-3.5 text-muted-foreground" />
                      Move to Group
                      <ChevronRight className="ml-auto size-3 text-muted-foreground" />
                    </DropdownMenu.SubTrigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.SubContent
                        sideOffset={4}
                        className="z-[var(--z-dropdown)] min-w-40 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
                      >
                        {c.groupId && (
                          <DropdownMenu.Item
                            className={itemCls}
                            onSelect={() => onMoveConnection(c.id, null)}
                          >
                            Ungrouped
                          </DropdownMenu.Item>
                        )}
                        {groups
                          .filter((g) => g.id !== c.groupId)
                          .map((g) => (
                            <DropdownMenu.Item
                              key={g.id}
                              className={itemCls}
                              onSelect={() => onMoveConnection(c.id, g.id)}
                            >
                              <span
                                className="size-2 shrink-0 rounded-full"
                                style={{ backgroundColor: g.color ?? '#6366f1' }}
                              />
                              <span className="truncate">{g.name}</span>
                            </DropdownMenu.Item>
                          ))}
                      </DropdownMenu.SubContent>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Sub>
                )}

                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                <DropdownMenu.Item
                  className={cn(
                    itemCls,
                    'text-destructive focus:bg-destructive/10 focus:text-destructive',
                  )}
                  onSelect={() => onRemove(c.id)}
                >
                  <Trash2 className="size-3.5 text-destructive" />
                  Remove Connection
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
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
                      placeholder={`${s?.tables.length ?? 0} ${
                        s ? getEngineCapabilities(s.engine).tableEntityLabelPlural : 'tables'
                      }`}
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
                            'flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1 text-left transition-colors',
                            activeTable === key
                              ? 'bg-ember-soft font-medium text-ember-text'
                              : 'text-fg hover:bg-accent/60',
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
  };

  return (
    <nav
      aria-label="Databases"
      className="flex w-64 shrink-0 flex-col border-r border-hairline bg-canvas"
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-hairline px-3">
        <span className="text-sm font-semibold text-fg">Databases</span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="New Workspace Group"
            title="Create Workspace Group"
            onClick={onCreateGroup}
          >
            <FolderPlus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Map of all databases"
            title="Map of all databases"
            disabled={connections.length === 0}
            onClick={() => onOpenMap(null)}
            className={cn(mapOpen && !selectedGroupId && 'bg-accent text-accent-foreground')}
          >
            <Network className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Add a connection"
            title="Add a connection"
            onClick={() => onAddConnection(null)}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {unconnected.length > 0 && (
          <div className="mx-2 mb-2 rounded-lg border border-hairline bg-muted/40 px-2.5 py-2">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Zap className="size-3 text-warning" aria-hidden />
              Running on this Mac
            </p>
            {unconnected.map((d) => (
              <div key={d.port} className="mt-1 flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-mono text-fg">
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

        {/* Groups */}
        {groups.map((group) => {
          const groupConnections = connections.filter((c) => c.groupId === group.id);
          const isCollapsed = collapsedGroups[group.id] ?? false;
          const isGroupMapActive = mapOpen && selectedGroupId === group.id;

          return (
            <div key={group.id} className="mb-2">
              <div
                className={cn(
                  'group mx-2 flex items-center justify-between rounded-md px-2 py-1 transition-colors',
                  isGroupMapActive ? 'bg-accent/80 font-medium' : 'hover:bg-accent/50',
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={!isCollapsed}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left text-xs font-semibold text-fg"
                >
                  <ChevronRight
                    className={cn(
                      'size-3.5 shrink-0 text-muted-foreground transition-transform',
                      !isCollapsed && 'rotate-90',
                    )}
                  />
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: group.color ?? '#6366f1' }}
                  />
                  <span className="truncate">{group.name}</span>
                  <span className="text-[10px] font-normal text-muted-foreground">
                    ({groupConnections.length})
                  </span>
                </button>

                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    aria-label={`Open map for ${group.name}`}
                    title="Open Group Architecture Map"
                    disabled={groupConnections.length === 0}
                    onClick={() => onOpenMap(group.id)}
                    className={cn(
                      'rounded p-1 text-muted-foreground hover:text-fg disabled:opacity-30',
                      isGroupMapActive && 'text-primary',
                    )}
                  >
                    <Network className="size-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Add connection to ${group.name}`}
                    title="Add connection to group"
                    onClick={() => onAddConnection(group.id)}
                    className="rounded p-1 text-muted-foreground hover:text-fg"
                  >
                    <Plus className="size-3" />
                  </button>
                  <DropdownMenu.Root modal={false}>
                    <DropdownMenu.Trigger asChild>
                      <button
                        type="button"
                        aria-label={`Group options for ${group.name}`}
                        className="rounded p-1 text-muted-foreground hover:text-fg"
                      >
                        <MoreHorizontal className="size-3" />
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        align="end"
                        sideOffset={4}
                        className="z-[var(--z-dropdown)] min-w-36 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
                      >
                        <DropdownMenu.Item className={itemCls} onSelect={() => onEditGroup(group)}>
                          <Pencil className="size-3.5 text-muted-foreground" />
                          Edit Group
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator className="my-1 h-px bg-border" />
                        <DropdownMenu.Item
                          className={cn(
                            itemCls,
                            'text-destructive focus:bg-destructive/10 focus:text-destructive',
                          )}
                          onSelect={() => onDeleteGroup(group, groupConnections.length)}
                        >
                          <Trash2 className="size-3.5 text-destructive" />
                          Delete Group
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>
              </div>

              {!isCollapsed && (
                <div className="mt-0.5">
                  {groupConnections.length === 0 ? (
                    <p className="px-6 py-1.5 text-[11px] text-muted-foreground">
                      No databases. Click + to add.
                    </p>
                  ) : (
                    groupConnections.map(renderConnectionItem)
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Ungrouped connections */}
        {ungroupedConnections.length > 0 && (
          <div className="mt-2">
            {groups.length > 0 && (
              <div className="px-3 py-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Ungrouped ({ungroupedConnections.length})
              </div>
            )}
            {ungroupedConnections.map(renderConnectionItem)}
          </div>
        )}
      </div>
    </nav>
  );
};
