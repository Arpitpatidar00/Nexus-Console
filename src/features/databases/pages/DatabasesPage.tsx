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
import type { DbConnection } from '../api/databases.schema';

export function DatabasesPage() {
  const { data: connections = [], isLoading } = useDbConnections();
  const { data: discovered = [] } = useDiscoveredDatabases();
  const addConn = useAddDbConnection();
  const removeConn = useRemoveDbConnection();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'query' | 'branching'>('query');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editorQuery, setEditorQuery] = useState('SELECT 1;');

  // New connection form state
  const [newName, setNewName] = useState('');
  const [newDriver, setNewDriver] = useState('postgres');
  const [newHost, setNewHost] = useState('127.0.0.1');
  const [newPort, setNewPort] = useState(5432);
  const [newUser, setNewUser] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDb, setNewDb] = useState('');
  const [newDataDir, setNewDataDir] = useState('');

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

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    addConn.mutate(
      {
        name: newName.trim(),
        driver: newDriver,
        host: newHost.trim(),
        port: Number(newPort),
        user: newUser.trim() || null,
        password: newPassword.trim() || undefined,
        database: newDb.trim() || null,
        allowWrites: false,
        env: 'dev',
        dataDir: newDataDir.trim() || null,
      },
      {
        onSuccess: () => {
          setIsAddOpen(false);
          setNewName('');
          setNewPassword('');
        },
      },
    );
  };

  return (
    <div className="bg-surface-base text-text-primary flex h-full overflow-hidden">
      {/* Left Sidebar: Connections & Discovered Services */}
      <div className="border-border-subtle bg-surface-elevated flex w-72 flex-col border-r">
        <div className="border-border-subtle flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-blue-400" />
            <h1 className="text-text-muted text-xs font-semibold tracking-tight uppercase">
              Databases
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className="hover:bg-surface-subtle text-text-muted hover:text-text-primary rounded p-1 transition-colors"
            title="Add Connection"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Auto-Discovered Local Services Banner */}
        {discovered.length > 0 && (
          <div className="bg-surface-subtle/50 border-border-subtle space-y-2 border-b p-3">
            <div className="text-text-muted flex items-center gap-1.5 text-[11px] font-semibold">
              <Zap className="h-3 w-3 text-amber-400" />
              <span>Auto-Discovered Services</span>
            </div>
            <div className="space-y-1">
              {discovered.map((d) => (
                <div key={d.port} className="flex items-center justify-between py-1 text-xs">
                  <span className="truncate font-mono text-[11px]">{d.name}</span>
                  <button
                    type="button"
                    onClick={() => handleQuickAdd(d)}
                    className="rounded bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400 hover:bg-blue-500/20"
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
          {isLoading ? (
            <div className="text-text-muted p-4 text-center text-xs">Loading connections...</div>
          ) : connections.length === 0 ? (
            <div className="text-text-muted space-y-2 p-4 text-center text-xs">
              <Server className="mx-auto h-6 w-6 text-zinc-500" />
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
                      ? 'border border-blue-500/30 bg-blue-500/10 text-blue-400'
                      : 'hover:bg-surface-subtle text-text-muted hover:text-text-primary'
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
                    className="p-1 text-zinc-500 opacity-60 transition-opacity hover:text-red-400 hover:opacity-100"
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
            <div className="border-border-subtle bg-surface-elevated flex items-center justify-between border-b p-4">
              <div className="flex items-center gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-text-primary text-sm font-semibold">
                      {activeConnection.name}
                    </h2>
                    <span className="rounded bg-zinc-500/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 uppercase">
                      {activeConnection.driver}
                    </span>
                    {!activeConnection.allowWrites && (
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                        Read-Only Protected
                      </span>
                    )}
                  </div>
                  <div className="text-text-muted mt-0.5 font-mono text-xs">
                    {activeConnection.host}:{activeConnection.port}
                    {activeConnection.database && ` • db: ${activeConnection.database}`}
                  </div>
                </div>
              </div>

              {/* View Toggle */}
              <div className="bg-surface-subtle border-border-subtle flex items-center gap-1 rounded-lg border p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('query')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeTab === 'query'
                      ? 'bg-surface-elevated text-text-primary shadow-sm'
                      : 'text-text-muted hover:text-text-primary'
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
                      ? 'bg-surface-elevated text-text-primary shadow-sm'
                      : 'text-text-muted hover:text-text-primary'
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
            <Database className="h-12 w-12 text-zinc-600" />
            <div className="text-sm font-medium">Select or Connect a Database</div>
            <p className="text-text-muted max-w-sm text-xs">
              Connect to your local Postgres, MySQL, or Redis instance to inspect schema, run
              read-only queries, and create APFS snapshots.
            </p>
          </div>
        )}
      </div>

      {/* Add Connection Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleManualAdd}
            className="bg-surface-elevated border-border-subtle w-full max-w-md space-y-4 rounded-xl border p-5 shadow-xl"
          >
            <div className="border-border-subtle flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-semibold">Add Database Connection</h3>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="text-text-muted hover:text-text-primary text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label htmlFor="conn-name" className="text-text-muted mb-1 block">
                  Connection Name
                </label>
                <input
                  id="conn-name"
                  type="text"
                  required
                  placeholder="e.g. Local App DB"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="bg-surface-subtle border-border-subtle text-text-primary w-full rounded border px-3 py-1.5 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="conn-driver" className="text-text-muted mb-1 block">
                    Driver
                  </label>
                  <select
                    id="conn-driver"
                    value={newDriver}
                    onChange={(e) => setNewDriver(e.target.value)}
                    className="bg-surface-subtle border-border-subtle text-text-primary w-full rounded border px-3 py-1.5 focus:outline-none"
                  >
                    <option value="postgres">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                    <option value="redis">Redis</option>
                    <option value="mongodb">MongoDB</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="conn-port" className="text-text-muted mb-1 block">
                    Port
                  </label>
                  <input
                    id="conn-port"
                    type="number"
                    required
                    value={newPort}
                    onChange={(e) => setNewPort(Number(e.target.value))}
                    className="bg-surface-subtle border-border-subtle text-text-primary w-full rounded border px-3 py-1.5 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="conn-host" className="text-text-muted mb-1 block">
                    Host
                  </label>
                  <input
                    id="conn-host"
                    type="text"
                    required
                    value={newHost}
                    onChange={(e) => setNewHost(e.target.value)}
                    className="bg-surface-subtle border-border-subtle text-text-primary w-full rounded border px-3 py-1.5 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="conn-user" className="text-text-muted mb-1 block">
                    User
                  </label>
                  <input
                    id="conn-user"
                    type="text"
                    placeholder="e.g. postgres"
                    value={newUser}
                    onChange={(e) => setNewUser(e.target.value)}
                    className="bg-surface-subtle border-border-subtle text-text-primary w-full rounded border px-3 py-1.5 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="conn-db" className="text-text-muted mb-1 block">
                  Database Name
                </label>
                <input
                  id="conn-db"
                  type="text"
                  placeholder="e.g. app_development"
                  value={newDb}
                  onChange={(e) => setNewDb(e.target.value)}
                  className="bg-surface-subtle border-border-subtle text-text-primary w-full rounded border px-3 py-1.5 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="conn-password" className="text-text-muted mb-1 block">
                  Password (stored securely in Keychain)
                </label>
                <input
                  id="conn-password"
                  type="password"
                  placeholder="Optional password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="bg-surface-subtle border-border-subtle text-text-primary w-full rounded border px-3 py-1.5 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="conn-datadir" className="text-text-muted mb-1 block">
                  Data Directory (for APFS branching)
                </label>
                <input
                  id="conn-datadir"
                  type="text"
                  placeholder="e.g. /opt/homebrew/var/postgresql@16"
                  value={newDataDir}
                  onChange={(e) => setNewDataDir(e.target.value)}
                  className="bg-surface-subtle border-border-subtle text-text-primary w-full rounded border px-3 py-1.5 font-mono text-[11px] focus:outline-none"
                />
              </div>
            </div>

            <div className="border-border-subtle flex items-center justify-end gap-2 border-t pt-2">
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="text-text-muted hover:text-text-primary rounded px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addConn.isPending}
                className="rounded bg-blue-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500"
              >
                Save Connection
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
