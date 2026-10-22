import { useState } from 'react';
import { Database, Plus, Trash2, GitBranch, Terminal, Server, Zap } from 'lucide-react';
import {
  useDbConnections,
  useDiscoveredDatabases,
  useAddDbConnection,
  useRemoveDbConnection,
} from '../api/useDatabases';
import { SnapshotsPanel } from '../components/SnapshotsPanel/SnapshotsPanel';
import { SchemaBrowser } from '../components/SchemaBrowser/SchemaBrowser';
import { QueryEditor } from '../components/QueryEditor/QueryEditor';
import { AddConnectionDialog } from '../components/AddConnectionDialog';
import type { DbConnection } from '../api/databases.schema';
import { Skeleton } from '@/shared/ui/Skeleton';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';

export function DatabasesPage() {
  const { data: connections = [], isLoading, error, refetch } = useDbConnections();
  const { data: discovered = [] } = useDiscoveredDatabases();
  const addConn = useAddDbConnection();
  const removeConn = useRemoveDbConnection();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'query' | 'branching'>('query');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editorQuery, setEditorQuery] = useState('SELECT 1;');

  const activeConnection: DbConnection | undefined =
    connections.find((c) => c.id === selectedId) || connections[0];

  const handleQuickAdd = (disc: {
    name: string;
    driver: string;
    port: number;
    dataDir: string | null;
  }) => {
    addConn.mutate({
      name: disc.name,
      driver: disc.driver,
      host: '127.0.0.1',
      port: disc.port,
      user: disc.driver === 'postgres' ? 'postgres' : 'root',
      database: disc.driver === 'postgres' ? 'postgres' : '',
      allowWrites: false,
      env: 'dev',
      dataDir: disc.dataDir,
    });
  };

  return (
    <div className="flex h-full overflow-hidden bg-canvas text-fg">
      {/* Left Sidebar: Connections & Discovered Services */}
      <div className="flex w-72 flex-col border-r border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-info" />
            <h1 className="text-xs font-semibold tracking-tight text-fg-muted uppercase">
              Databases
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className="rounded p-1 text-fg-muted transition-colors hover:bg-muted hover:text-fg"
            title="Add Connection"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Auto-Discovered Local Services Banner */}
        {discovered.length > 0 && (
          <div className="space-y-2 border-b border-border bg-muted/50 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-muted">
              <Zap className="h-3 w-3 text-warning" />
              <span>Auto-Discovered Services</span>
            </div>
            <div className="space-y-1">
              {discovered.map((d) => (
                <div key={d.port} className="flex items-center justify-between py-1 text-xs">
                  <span className="truncate font-mono text-[11px]">{d.name}</span>
                  <button
                    type="button"
                    onClick={() => handleQuickAdd(d)}
                    className="rounded bg-info-soft px-2 py-0.5 text-[10px] font-medium text-info hover:bg-info-soft"
                  >
                    + Connect
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Saved Connections List */}
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {error ? (
            <ErrorPanel
              error={error}
              fallback="Couldn't load your database connections."
              onRetry={() => void refetch()}
            />
          ) : isLoading ? (
            <Skeleton className="p-4" />
          ) : connections.length === 0 ? (
            <div className="space-y-2 p-4 text-center text-xs text-fg-muted">
              <Server className="mx-auto h-6 w-6 text-muted-foreground" />
              <div>No database connections. Connect a discovered local database above.</div>
            </div>
          ) : (
            connections.map((c) => {
              const isSelected = activeConnection?.id === c.id;
              return (
                <div
                  key={c.id}
                  className={`flex items-center justify-between rounded-lg p-2.5 transition-colors ${
                    isSelected
                      ? 'border border-info-soft bg-info-soft text-info'
                      : 'text-fg-muted hover:bg-muted hover:text-fg'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className="flex-1 space-y-0.5 truncate text-left"
                  >
                    <div className="truncate text-xs font-semibold">{c.name}</div>
                    <div className="truncate font-mono text-[10px] opacity-80">
                      {c.driver}://{c.host}:{c.port}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      removeConn.mutate(c.id);
                    }}
                    className="p-1 text-muted-foreground opacity-60 transition-opacity hover:text-destructive hover:opacity-100"
                    title="Remove connection"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {activeConnection ? (
          <>
            {/* Top Bar */}
            <div className="flex items-center justify-between border-b border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-fg">{activeConnection.name}</h2>
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground uppercase">
                      {activeConnection.driver}
                    </span>
                    {!activeConnection.allowWrites && (
                      <span className="rounded bg-success-soft px-1.5 py-0.5 text-[10px] font-medium text-success">
                        Read-Only Protected
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-fg-muted">
                    {activeConnection.host}:{activeConnection.port}
                    {activeConnection.database && ` • db: ${activeConnection.database}`}
                  </div>
                </div>
              </div>

              {/* View Toggle */}
              <div className="flex items-center gap-1 rounded-lg border border-border bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('query')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeTab === 'query'
                      ? 'bg-card text-fg shadow-sm'
                      : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  <Terminal className="h-3.5 w-3.5" />
                  Query & Data
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('branching')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeTab === 'branching'
                      ? 'bg-card text-fg shadow-sm'
                      : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  APFS Branches
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex flex-1 overflow-hidden">
              {activeTab === 'query' ? (
                <div className="flex flex-1 overflow-hidden">
                  <SchemaBrowser
                    connectionId={activeConnection.id}
                    onSelectTable={(tableName) => {
                      const q =
                        activeConnection.driver === 'mongodb' || activeConnection.driver === 'mongo'
                          ? `db.${tableName}.find().limit(50)`
                          : `SELECT * FROM ${tableName} LIMIT 50;`;
                      setEditorQuery(q);
                    }}
                  />
                  <div className="flex-1 overflow-hidden p-6">
                    <QueryEditor
                      key={`${activeConnection.id}-${editorQuery}`}
                      connectionId={activeConnection.id}
                      allowWrites={activeConnection.allowWrites && activeConnection.env !== 'prod'}
                      defaultQuery={editorQuery}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-6">
                  <SnapshotsPanel connection={activeConnection} />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center space-y-3 p-8 text-center">
            <Database className="h-12 w-12 text-muted-foreground" />
            <div className="text-sm font-medium">Select or Connect a Database</div>
            <p className="max-w-sm text-xs text-fg-muted">
              Connect to your local Postgres, MySQL, or Redis instance to inspect schema, run
              read-only queries, and create APFS snapshots.
            </p>
          </div>
        )}
      </div>

      <AddConnectionDialog open={isAddOpen} onOpenChange={setIsAddOpen} />
    </div>
  );
}
