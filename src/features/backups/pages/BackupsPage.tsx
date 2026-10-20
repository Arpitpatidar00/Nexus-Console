import { useState } from 'react';
import {
  HardDriveDownload,
  Database,
  FileCode,
  Plus,
  Trash2,
  RefreshCw,
  FolderArchive,
  Lock,
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import {
  useBackupHistory,
  useCreateDbBackup,
  useBackupEnv,
  useDeleteBackup,
} from '../api/useBackups';

export const BackupsPage = () => {
  const { data: backups = [], isLoading, refetch } = useBackupHistory();
  const createDbMutation = useCreateDbBackup();
  const backupEnvMutation = useBackupEnv();
  const deleteBackupMutation = useDeleteBackup();

  const [dbModalOpen, setDbModalOpen] = useState(false);
  const [envModalOpen, setEnvModalOpen] = useState(false);

  // DB Backup Form State
  const [source, setSource] = useState<'local' | 'remote'>('local');
  const [hostAlias, setHostAlias] = useState('');
  const [engine, setEngine] = useState<'postgres' | 'mysql' | 'sqlite' | 'mongodb'>('postgres');
  const [database, setDatabase] = useState('');

  // Env Backup Form State
  const [projectPath, setProjectPath] = useState('');

  const handleCreateDbBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!database) return;
    await createDbMutation.mutateAsync({
      source,
      host_alias: source === 'remote' ? hostAlias : undefined,
      engine,
      database,
    });
    setDbModalOpen(false);
    setDatabase('');
    setHostAlias('');
  };

  const handleBackupEnv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectPath) return;
    await backupEnvMutation.mutateAsync(projectPath);
    setEnvModalOpen(false);
    setProjectPath('');
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6 text-fg">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-border pb-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <HardDriveDownload className="h-6 w-6 text-emerald-400" />
            Automated Backups & Secret Archives
          </h1>
          <p className="text-muted-fg mt-1 text-xs">
            Local & remote database snapshots streamed over SSH pipe with strict 0600 file
            permissions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEnvModalOpen(true)}
            className="flex items-center gap-1.5 text-xs"
          >
            <FileCode className="h-3.5 w-3.5 text-amber-400" />
            Backup Project .env
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setDbModalOpen(true)}
            className="flex items-center gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            New Database Backup
          </Button>
        </div>
      </div>

      {/* Security Callout Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-200">
        <Lock className="h-5 w-5 shrink-0 text-emerald-400" />
        <div>
          <span className="font-bold">Zero-Remote-Persistence Security:</span>
          <p className="mt-0.5 text-emerald-300/80">
            When backing up remote servers, database dumps are streamed directly through the
            encrypted SSH pipeline into local storage. Dump files are never written to the remote
            filesystem, preventing leakage on shared servers. Locally created archives are locked to
            permissions <code className="rounded bg-black/20 px-1 py-0.5 font-mono">0600</code>{' '}
            (read/write by owner only).
          </p>
        </div>
      </div>

      {/* Backups Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-card/40 shadow-sm">
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-fg">
            <FolderArchive className="h-4 w-4 text-emerald-400" />
            Backup Archives ({backups.length})
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="text-muted-fg border-b border-border bg-muted/40 font-semibold">
              <th className="px-4 py-3">Source & Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Target Path</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="text-muted-fg px-4 py-8 text-center">
                  Loading backup history...
                </td>
              </tr>
            ) : backups.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-muted-fg px-4 py-8 text-center">
                  No backup archives created yet. Use the buttons above to create your first backup.
                </td>
              </tr>
            ) : (
              backups.map((bk) => (
                <tr key={bk.id} className="transition-colors hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-fg">{bk.source_name}</div>
                    <div className="text-muted-fg font-mono text-[10px]">{bk.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="neutral" className="text-[10px] uppercase">
                      {bk.source_type}
                    </Badge>
                  </td>
                  <td
                    className="text-muted-fg max-w-xs truncate px-4 py-3 font-mono text-[11px]"
                    title={bk.target_file}
                  >
                    {bk.target_file}
                  </td>
                  <td className="px-4 py-3 font-mono text-fg">{formatBytes(bk.size_bytes)}</td>
                  <td className="text-muted-fg px-4 py-3">
                    {new Date(bk.created_at * 1000).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={bk.status === 'success' ? 'default' : 'destructive'}
                      className="text-[10px]"
                    >
                      {bk.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteBackupMutation.mutate(bk.id)}
                      className="text-muted-fg hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Database Backup Modal */}
      <Dialog.Root open={dbModalOpen} onOpenChange={setDbModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-2xl">
            <Dialog.Title className="flex items-center gap-2 text-base font-bold text-fg">
              <Database className="h-5 w-5 text-emerald-400" />
              Create Database Backup
            </Dialog.Title>
            <Dialog.Description className="text-muted-fg mt-1 text-xs">
              Choose local or remote SSH source. Remote databases stream directly to your machine.
            </Dialog.Description>

            <form onSubmit={handleCreateDbBackup} className="mt-4 space-y-4">
              <div>
                <span className="text-xs font-semibold text-fg">Backup Source</span>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSource('local')}
                    className={`flex-1 rounded border py-1.5 text-xs font-medium ${
                      source === 'local'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                        : 'text-muted-fg border-border'
                    }`}
                  >
                    Local Database
                  </button>
                  <button
                    type="button"
                    onClick={() => setSource('remote')}
                    className={`flex-1 rounded border py-1.5 text-xs font-medium ${
                      source === 'remote'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                        : 'text-muted-fg border-border'
                    }`}
                  >
                    Remote SSH Host
                  </button>
                </div>
              </div>

              {source === 'remote' && (
                <div>
                  <label htmlFor="host-alias-input" className="text-xs font-semibold text-fg">
                    SSH Host Alias
                  </label>
                  <input
                    id="host-alias-input"
                    type="text"
                    required
                    placeholder="e.g. prod-bastion or app-server-1"
                    value={hostAlias}
                    onChange={(e) => setHostAlias(e.target.value)}
                    className="mt-1 w-full rounded border border-border bg-muted/20 px-3 py-1.5 text-xs text-fg focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label htmlFor="db-engine-select" className="text-xs font-semibold text-fg">
                  Database Engine
                </label>
                <select
                  id="db-engine-select"
                  value={engine}
                  onChange={(e) => setEngine(e.target.value as any)}
                  className="mt-1 w-full rounded border border-border bg-muted/20 px-3 py-1.5 text-xs text-fg focus:outline-none"
                >
                  <option value="postgres">PostgreSQL (pg_dump)</option>
                  <option value="mysql">MySQL / MariaDB (mysqldump)</option>
                  <option value="sqlite">SQLite (.backup)</option>
                  <option value="mongodb">MongoDB (mongodump)</option>
                </select>
              </div>

              <div>
                <label htmlFor="db-name-input" className="text-xs font-semibold text-fg">
                  Database Name / Path
                </label>
                <input
                  id="db-name-input"
                  type="text"
                  required
                  placeholder="e.g. users_db or /path/to/db.sqlite"
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  className="mt-1 w-full rounded border border-border bg-muted/20 px-3 py-1.5 text-xs text-fg focus:outline-none"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDbModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  size="sm"
                  disabled={createDbMutation.isPending}
                >
                  {createDbMutation.isPending ? 'Backing Up...' : 'Start Backup'}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Project .env Backup Modal */}
      <Dialog.Root open={envModalOpen} onOpenChange={setEnvModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-2xl">
            <Dialog.Title className="flex items-center gap-2 text-base font-bold text-fg">
              <FileCode className="h-5 w-5 text-amber-400" />
              Backup Project .env Files
            </Dialog.Title>
            <Dialog.Description className="text-muted-fg mt-1 text-xs">
              Gathers all `.env*` files in the directory and packs them into a compressed 0600
              tarball.
            </Dialog.Description>

            <form onSubmit={handleBackupEnv} className="mt-4 space-y-4">
              <div>
                <label htmlFor="project-path-input" className="text-xs font-semibold text-fg">
                  Project Root Directory
                </label>
                <input
                  id="project-path-input"
                  type="text"
                  required
                  placeholder="/Users/username/my-project"
                  value={projectPath}
                  onChange={(e) => setProjectPath(e.target.value)}
                  className="mt-1 w-full rounded border border-border bg-muted/20 px-3 py-1.5 font-mono text-xs text-fg focus:outline-none"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEnvModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  size="sm"
                  disabled={backupEnvMutation.isPending}
                >
                  {backupEnvMutation.isPending ? 'Archiving...' : 'Create .env Archive'}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
