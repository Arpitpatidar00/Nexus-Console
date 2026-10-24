import { useState } from 'react';
import { ArrowLeft, Database } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { Switch } from '@/shared/ui/Switch';
import {
  useAddDbConnection,
  useDbConnections,
  useDiscoveredDatabases,
  useRemoveDbConnection,
} from '../api/useDatabases';
import { useDbSchema } from '../api/useExplorer';
import type { DiscoveredDb } from '../api/databases.schema';
import type { Filter } from '../api/explorer.schema';
import { buildDiagram, type Detail } from '../utils/diagram';
import { fileStem, toMermaid } from '../utils/mermaid';
import { declaredLinks, keyOf, linksOf } from '../utils/relations';
import { AddConnectionDialog } from '../components/AddConnectionDialog';
import { DatabaseOverview } from '../components/DatabaseOverview';
import { DiagramCanvas } from '../components/DiagramCanvas';
import { ExplorerSidebar } from '../components/ExplorerSidebar';
import { MapView } from '../components/MapView';
import { QueryEditor } from '../components/QueryEditor/QueryEditor';
import { SnapshotsPanel } from '../components/SnapshotsPanel/SnapshotsPanel';
import { TableView } from '../components/TableView';

type Tab = 'overview' | 'diagram' | 'sql' | 'branches';

interface Opened {
  key: string;
  filter?: Filter;
}

const ENGINE_LABEL: Record<string, string> = {
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  mongodb: 'MongoDB',
  mongo: 'MongoDB',
  redis: 'Redis',
};

export function DatabasesPage() {
  const connectionsQ = useDbConnections();
  const connections = connectionsQ.data ?? [];
  const { data: discovered = [] } = useDiscoveredDatabases();
  const addConn = useAddDbConnection();
  const removeConn = useRemoveDbConnection();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  // Following links pushes onto a trail, so Back retraces them.
  const [trail, setTrail] = useState<Opened[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [guesses, setGuesses] = useState(true);

  const active = connections.find((c) => c.id === selectedId) ?? connections[0];
  const schemaQ = useDbSchema(active?.id ?? null);
  const schema = schemaQ.data;
  const links = schema ? (guesses ? linksOf(schema) : declaredLinks(schema)) : [];
  const opened = trail.at(-1) ?? null;
  const openTable = opened && schema?.tables.find((t) => keyOf(t) === opened.key);
  const nameOf = (key: string) =>
    schema && schema.schemas.length > 1 ? key : key.slice(key.indexOf('.') + 1);

  const select = (id: string) => {
    setMapOpen(false);
    if (id !== active?.id) {
      setSelectedId(id);
      setTrail([]);
      setTab('overview');
      setDetail(null);
    } else {
      setTrail([]);
    }
  };
  const open = (key: string, filter?: Filter) => {
    setMapOpen(false);
    setTrail((t) => [...t, { key, filter }]);
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
    });

  const fullDetail: Detail = detail ?? ((schema?.tables.length ?? 0) > 25 ? 'keys' : 'all');

  return (
    <div className="flex h-full overflow-hidden bg-canvas text-fg">
      <ExplorerSidebar
        connections={connections}
        discovered={discovered}
        selectedId={active?.id ?? null}
        schema={{
          data: schema,
          isLoading: schemaQ.isLoading,
          isFetching: schemaQ.isFetching,
          error: schemaQ.error,
          refetch: () => void schemaQ.refetch(),
        }}
        activeTable={opened?.key ?? null}
        mapOpen={mapOpen}
        onSelect={select}
        onOpenTable={(key) => {
          setMapOpen(false);
          setTrail([{ key }]);
        }}
        onOpenMap={() => setMapOpen(true)}
        onAdd={() => setIsAddOpen(true)}
        onQuickAdd={quickAdd}
        onRemove={(id) => removeConn.mutate(id)}
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
            <header className="flex h-12 shrink-0 items-center border-b border-hairline px-4">
              <h1 className="text-sm font-semibold text-fg">All databases</h1>
            </header>
            <MapView
              connections={connections}
              onOpenTable={(connectionId, key) => {
                setMapOpen(false);
                setSelectedId(connectionId);
                setTrail([{ key }]);
              }}
            />
          </>
        ) : !active ? (
          <EmptyState
            icon={<Database className="size-10" />}
            title="Explore a database"
            description="Add a connection — or paste a DATABASE_URL — to browse rows like documents, see how tables connect, and export the diagram."
            action={
              <Button variant="ember" size="sm" onClick={() => setIsAddOpen(true)}>
                Add a connection
              </Button>
            }
          />
        ) : (
          <>
            <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-hairline px-4">
              <div className="flex min-w-0 items-center gap-2">
                {trail.length > 0 && (
                  <Button
                    variant="ghost"
                    size="iconSm"
                    aria-label="Back"
                    title={
                      trail.length > 1
                        ? `Back to ${nameOf(trail[trail.length - 2].key)}`
                        : 'Back to overview'
                    }
                    onClick={() => setTrail((t) => t.slice(0, -1))}
                  >
                    <ArrowLeft />
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => setTrail([])}
                  className="min-w-0 cursor-pointer truncate text-sm font-semibold text-fg hover:underline"
                >
                  {active.name}
                </button>
                <span className="hidden shrink-0 truncate font-mono text-xs text-muted-foreground md:inline">
                  {ENGINE_LABEL[active.driver] ?? active.driver} · {active.host}
                  {active.database ? ` / ${active.database}` : ''}
                </span>
                {active.env === 'prod' || !active.allowWrites ? (
                  <span className="shrink-0 rounded bg-success-soft px-1.5 text-[11px] font-medium text-success">
                    read-only
                  </span>
                ) : (
                  <span className="shrink-0 rounded bg-warning-soft px-1.5 text-[11px] font-medium text-warning">
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
                    ...(active.driver === 'redis'
                      ? []
                      : [{ value: 'diagram' as const, label: 'Diagram' }]),
                    {
                      value: 'sql',
                      label: active.driver.startsWith('mongo')
                        ? 'Shell'
                        : active.driver === 'redis'
                          ? 'Commands'
                          : 'SQL',
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
                key={`${active.id}:${trail.length}:${opened!.key}`}
                connectionId={active.id}
                connectionName={active.name}
                schema={schema}
                table={openTable}
                links={links}
                nameOf={nameOf}
                onOpenTable={open}
                initialFilter={opened!.filter}
              />
            ) : tab === 'sql' ? (
              <div className="min-h-0 flex-1 overflow-hidden p-4">
                <QueryEditor
                  key={active.id}
                  connectionId={active.id}
                  allowWrites={active.allowWrites && active.env !== 'prod'}
                  defaultQuery={
                    active.driver.startsWith('mongo')
                      ? 'db.getCollectionNames()'
                      : active.driver === 'redis'
                        ? 'INFO keyspace'
                        : 'SELECT 1;'
                  }
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
                onOpenTable={(key) => setTrail([{ key }])}
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
                onOpenTable={(key) => setTrail([{ key }])}
              />
            )}
          </>
        )}
      </main>

      <AddConnectionDialog open={isAddOpen} onOpenChange={setIsAddOpen} />
    </div>
  );
}
