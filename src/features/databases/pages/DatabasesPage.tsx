import { useEffect, useMemo, useReducer, useState } from 'react';
import { ArrowLeft, ChevronRight, Database } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { Switch } from '@/shared/ui/Switch';
import { cn } from '@/shared/lib/cn';
import {
  useAddDbConnection,
  useDbConnections,
  useDbGroups,
  useDiscoveredDatabases,
  useMoveDbConnection,
  useRemoveDbConnection,
} from '../api/useDatabases';
import { useDbSchema } from '../api/useExplorer';
import { useGroupRelations } from '../api/useGroupRelations';
import type { DbConnection, DbGroup, DiscoveredDb } from '../api/databases.schema';
import type { Filter } from '../api/explorer.schema';
import { buildDiagram, type Detail } from '../utils/diagram';
import { fileStem, toMermaid } from '../utils/mermaid';
import { declaredLinks, keyOf, linksOf } from '../utils/relations';
import {
  initialNavigationState,
  navigationReducer,
  reconcileNavigation,
} from '../utils/navigation';
import { AddConnectionDialog } from '../components/AddConnectionDialog';
import { DatabaseOverview } from '../components/DatabaseOverview';
import { DiagramCanvas } from '../components/DiagramCanvas';
import { EditConnectionDialog } from '../components/EditConnectionDialog';
import { ExplorerSidebar } from '../components/ExplorerSidebar';
import { DeleteGroupDialog, GroupDialog } from '../components/GroupDialog';
import { MapView } from '../components/MapView';
import { QueryEditor } from '../components/QueryEditor/QueryEditor';
import { SnapshotsPanel } from '../components/SnapshotsPanel/SnapshotsPanel';
import { TableView } from '../components/TableView';
import { getEngineCapabilities } from '../utils/capabilities';

type Tab = 'overview' | 'diagram' | 'sql' | 'branches';

const EMPTY_CONNS: DbConnection[] = [];

export function DatabasesPage() {
  const connectionsQ = useDbConnections();
  const connections = connectionsQ.data ?? EMPTY_CONNS;
  const { data: groups = [] } = useDbGroups();
  const { data: discovered = [] } = useDiscoveredDatabases();
  const addConn = useAddDbConnection();
  const removeConn = useRemoveDbConnection();
  const moveConn = useMoveDbConnection();

  const [navState, dispatchNav] = useReducer(navigationReducer, initialNavigationState);
  const [tab, setTab] = useState<Tab>('overview');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addGroupTargetId, setAddGroupTargetId] = useState<string | null>(null);
  const [editingConn, setEditingConn] = useState<DbConnection | null>(null);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<DbGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<{ group: DbGroup; count: number } | null>(
    null,
  );
  const [detail, setDetail] = useState<Detail | null>(null);
  const [guesses, setGuesses] = useState(true);

  const validConnIds = useMemo(() => new Set(connections.map((c) => c.id)), [connections]);

  useEffect(() => {
    if (
      validConnIds.size > 0 &&
      navState.connectionId &&
      !validConnIds.has(navState.connectionId)
    ) {
      const reconciled = reconcileNavigation(navState, validConnIds);
      if (reconciled.connectionId !== navState.connectionId) {
        if (reconciled.connectionId) {
          dispatchNav({ type: 'SELECT_CONNECTION', connectionId: reconciled.connectionId });
        }
      }
    }
  }, [validConnIds, navState]);

  const selectedId = navState.connectionId ?? connections[0]?.id ?? null;
  const selectedGroupId = navState.groupId;
  const mapOpen = navState.viewMode === 'map';
  const active = connections.find((c) => c.id === selectedId) ?? connections[0];
  const caps = getEngineCapabilities(active?.driver ?? '');
  const schemaQ = useDbSchema(active?.id ?? null);
  const schema = schemaQ.data;

  const activeGroupId = active?.groupId ?? selectedGroupId ?? null;
  const { linksForTable } = useGroupRelations(activeGroupId, connections);

  const opened = navState.trail.at(-1) ?? null;
  const openTable = opened && schema?.tables.find((t) => keyOf(t) === opened.tableKey);

  const localLinks = schema ? (guesses ? linksOf(schema) : declaredLinks(schema)) : [];
  const tableCrossLinks = opened && active ? linksForTable(active.id, opened.tableKey) : [];
  const links = [...localLinks, ...tableCrossLinks];

  const nameOf = (key: string) =>
    schema && schema.schemas.length > 1 ? key : key.slice(key.indexOf('.') + 1);

  const select = (id: string) => {
    const conn = connections.find((c) => c.id === id);
    dispatchNav({
      type: 'SELECT_CONNECTION',
      connectionId: id,
      groupId: conn?.groupId ?? null,
    });
    setTab('overview');
    setDetail(null);
  };

  const openMap = (groupId?: string | null) => {
    dispatchNav({ type: 'OPEN_MAP', groupId: groupId ?? null });
  };

  const handleOpenTable = (
    connectionIdOrKey: string,
    keyOrFilter?: string | Filter,
    filter?: Filter,
  ) => {
    let targetConnId: string = active?.id ?? '';
    let targetKey: string = connectionIdOrKey;
    let targetFilter: Filter | undefined = undefined;

    if (typeof keyOrFilter === 'string') {
      targetConnId = connectionIdOrKey;
      targetKey = keyOrFilter;
      targetFilter = filter;
    } else if (keyOrFilter && typeof keyOrFilter === 'object') {
      targetKey = connectionIdOrKey;
      targetFilter = keyOrFilter;
    } else {
      targetKey = connectionIdOrKey;
    }

    const targetConn = connections.find((c) => c.id === targetConnId);
    const name = nameOf(targetKey);

    dispatchNav({
      type: 'OPEN_TABLE',
      connectionId: targetConnId,
      tableKey: targetKey,
      filter: targetFilter,
      tableName: name,
      connectionName: targetConn?.name ?? targetConnId,
    });
  };

  const quickAdd = (d: DiscoveredDb) =>
    addConn.mutate({
      name: d.name,
      driver: d.driver,
      host: '127.0.0.1',
      port: d.port,
      user: d.driver === 'postgres' ? null : d.driver === 'mysql' ? 'root' : null,
      database: d.driver === 'postgres' ? 'postgres' : null,
      allowWrites: false,
      env: 'dev',
      dataDir: d.dataDir,
      groupId: null,
    });

  const fullDetail: Detail = detail ?? ((schema?.tables.length ?? 0) > 25 ? 'keys' : 'all');

  // Map view connections scoped by selected group or all
  const mapConnections = selectedGroupId
    ? connections.filter((c) => c.groupId === selectedGroupId)
    : connections;

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  return (
    <div className="flex h-full overflow-hidden bg-canvas text-fg">
      <ExplorerSidebar
        groups={groups}
        connections={connections}
        discovered={discovered}
        selectedId={active?.id ?? null}
        selectedGroupId={selectedGroupId}
        schema={{
          data: schema,
          isLoading: schemaQ.isLoading,
          isFetching: schemaQ.isFetching,
          error: schemaQ.error,
          refetch: () => void schemaQ.refetch(),
        }}
        activeTable={opened?.tableKey ?? null}
        mapOpen={mapOpen}
        onSelect={select}
        onOpenTable={(key) => handleOpenTable(active.id, key)}
        onOpenMap={openMap}
        onAddConnection={(groupId) => {
          setAddGroupTargetId(groupId ?? null);
          setIsAddOpen(true);
        }}
        onEditConnection={(conn) => setEditingConn(conn)}
        onMoveConnection={(id, targetGroupId) => moveConn.mutate({ id, groupId: targetGroupId })}
        onQuickAdd={quickAdd}
        onRemove={(id) => removeConn.mutate(id)}
        onCreateGroup={() => {
          setEditingGroup(null);
          setIsGroupModalOpen(true);
        }}
        onEditGroup={(g) => {
          setEditingGroup(g);
          setIsGroupModalOpen(true);
        }}
        onDeleteGroup={(g, count) => setDeletingGroup({ group: g, count })}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {connectionsQ.error ? (
          <div className="p-6">
            <ErrorPanel
              error={connectionsQ.error}
              fallback="Couldn't load your database connections."
              onRetry={() => void connectionsQ.refetch()}
            />
          </div>
        ) : mapOpen ? (
          <>
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-hairline px-4">
              <div className="flex items-center gap-2">
                {selectedGroup && (
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: selectedGroup.color ?? '#6366f1' }}
                  />
                )}
                <h1 className="text-sm font-semibold text-fg">
                  {selectedGroup ? `${selectedGroup.name} Architecture` : 'All Databases'}
                </h1>
                <span className="text-xs text-muted-foreground">
                  ({mapConnections.length} database{mapConnections.length === 1 ? '' : 's'})
                </span>
              </div>
            </header>
            <MapView
              connections={mapConnections}
              groupId={selectedGroupId}
              onOpenTable={(connectionId, key) => handleOpenTable(connectionId, key)}
            />
          </>
        ) : !active ? (
          <EmptyState
            icon={<Database className="size-10" />}
            title="Explore a database"
            description="Add a connection — or paste a DATABASE_URL — to browse rows like documents, see how tables connect, and export the diagram."
            action={
              <Button
                variant="ember"
                size="sm"
                onClick={() => {
                  setAddGroupTargetId(null);
                  setIsAddOpen(true);
                }}
              >
                Add a connection
              </Button>
            }
          />
        ) : !caps.isSupported ? (
          <div className="p-6">
            <ErrorPanel
              error={caps.unsupportedReason ?? `Driver "${active.driver}" is not supported.`}
              fallback="Unsupported Database Engine"
            />
          </div>
        ) : (
          <>
            <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-hairline px-4">
              <div className="flex min-w-0 items-center gap-1.5 text-xs">
                {navState.trail.length > 0 && (
                  <Button
                    variant="ghost"
                    size="iconSm"
                    aria-label="Back"
                    title={
                      navState.trail.length > 1
                        ? `Back to ${navState.trail[navState.trail.length - 2].tableName ?? 'previous table'}`
                        : 'Back to overview'
                    }
                    onClick={() => dispatchNav({ type: 'BACK' })}
                  >
                    <ArrowLeft />
                  </Button>
                )}

                {selectedGroup ? (
                  <button
                    type="button"
                    onClick={() => openMap(selectedGroup.id)}
                    className="cursor-pointer font-medium text-muted-foreground hover:text-fg hover:underline"
                    title="View Group Architecture Map"
                  >
                    {selectedGroup.name}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openMap(null)}
                    className="cursor-pointer font-medium text-muted-foreground hover:text-fg hover:underline"
                    title="View All Databases Map"
                  >
                    Databases
                  </button>
                )}

                <ChevronRight className="size-3 text-muted-foreground/60" aria-hidden />

                <button
                  type="button"
                  onClick={() => dispatchNav({ type: 'CLEAR_TRAIL' })}
                  className={cn(
                    'cursor-pointer truncate font-semibold hover:underline',
                    navState.trail.length === 0
                      ? 'text-sm text-fg'
                      : 'text-muted-foreground hover:text-fg',
                  )}
                  title="Connection Overview"
                >
                  {active.name}
                </button>

                {opened && (
                  <>
                    <ChevronRight className="size-3 text-muted-foreground/60" aria-hidden />
                    <span className="truncate text-sm font-semibold text-fg">
                      {nameOf(opened.tableKey)}
                    </span>
                    {opened.filter && (
                      <span
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                        title={`Filtered by ${opened.filter.column} ${opened.filter.op} ${opened.filter.value}`}
                      >
                        {opened.filter.column} = {opened.filter.value}
                      </span>
                    )}
                  </>
                )}

                <span className="ml-2 hidden shrink-0 truncate font-mono text-xs text-muted-foreground lg:inline">
                  {caps.displayName} · {active.host}
                  {active.database ? ` / ${active.database}` : ''}
                </span>

                {active.env === 'prod' || !active.allowWrites ? (
                  <span className="ml-1 shrink-0 rounded bg-success-soft px-1.5 text-[11px] font-medium text-success">
                    read-only
                  </span>
                ) : (
                  <span className="ml-1 shrink-0 rounded bg-warning-soft px-1.5 text-[11px] font-medium text-warning">
                    writes allowed in SQL
                  </span>
                )}
              </div>
              {!openTable && (
                <SegmentedControl<Tab>
                  ariaLabel="Database view"
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: 'overview', label: 'Overview' },
                    ...(caps.supportsDiagram
                      ? [{ value: 'diagram' as const, label: 'Diagram' }]
                      : []),
                    {
                      value: 'sql',
                      label: caps.queryEditorLabel,
                    },
                    ...(active.dataDir ? [{ value: 'branches' as const, label: 'Branches' }] : []),
                  ]}
                />
              )}
            </header>

            {schemaQ.error && !openTable && tab !== 'sql' && tab !== 'branches' ? (
              <div className="p-6">
                <ErrorPanel
                  error={schemaQ.error}
                  fallback="Couldn't read this database"
                  onRetry={() => void schemaQ.refetch()}
                />
              </div>
            ) : openTable && schema ? (
              <TableView
                key={`${active.id}:${navState.trail.length}:${opened!.tableKey}`}
                connectionId={active.id}
                connectionName={active.name}
                schema={schema}
                table={openTable}
                links={links}
                nameOf={nameOf}
                onOpenTable={handleOpenTable}
                initialFilter={opened!.filter}
                connections={connections}
              />
            ) : tab === 'sql' ? (
              <div className="min-h-0 flex-1 overflow-hidden p-4">
                <QueryEditor
                  key={active.id}
                  connectionId={active.id}
                  allowWrites={active.allowWrites && active.env !== 'prod'}
                  defaultQuery={caps.defaultQuery}
                />
              </div>
            ) : tab === 'branches' ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <SnapshotsPanel connection={active} />
              </div>
            ) : !schema ? (
              <div aria-hidden className="space-y-2 p-4">
                {Array.from({ length: 8 }, (_, i) => (
                  <div
                    key={i}
                    className="h-8 animate-pulse rounded bg-muted motion-reduce:animate-none"
                  />
                ))}
              </div>
            ) : tab === 'diagram' ? (
              <DiagramCanvas
                diagram={buildDiagram(schema.tables, links, fullDetail)}
                detail={fullDetail}
                onDetail={setDetail}
                onOpenTable={(key) => handleOpenTable(active.id, key)}
                exportName={fileStem(active.name, 'diagram')}
                exportTitle={`${active.name} · ${schema.database}`}
                mermaid={() => toMermaid(schema.tables, links)}
                aside={
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      id="diagram-guesses"
                      checked={guesses}
                      onChange={setGuesses}
                      ariaLabel="Show links guessed from column names"
                    />
                    <label htmlFor="diagram-guesses" className="cursor-pointer">
                      Guessed links
                    </label>
                  </span>
                }
                footnote={`${schema.tables.length} tables · ${schema.relations.length} foreign keys${
                  guesses ? ` · ${links.length - schema.relations.length} guessed (dashed)` : ''
                } · hover a table to light up its links, click to open it`}
              />
            ) : (
              <DatabaseOverview
                schema={schema}
                links={links}
                onOpenTable={(key) => handleOpenTable(active.id, key)}
              />
            )}
          </>
        )}
      </main>

      <AddConnectionDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        defaultGroupId={addGroupTargetId}
      />

      <EditConnectionDialog
        open={Boolean(editingConn)}
        onOpenChange={(open) => !open && setEditingConn(null)}
        connection={editingConn}
      />

      <GroupDialog
        open={isGroupModalOpen}
        onOpenChange={setIsGroupModalOpen}
        group={editingGroup}
      />

      <DeleteGroupDialog
        open={Boolean(deletingGroup)}
        onOpenChange={(open) => !open && setDeletingGroup(null)}
        group={deletingGroup?.group ?? null}
        connectionCount={deletingGroup?.count ?? 0}
      />
    </div>
  );
}
