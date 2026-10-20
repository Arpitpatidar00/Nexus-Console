import { useState } from 'react';
import { GitBranch, Plus, RotateCcw, HardDrive, AlertCircle } from 'lucide-react';
import { useDbSnapshots, useCreateDbSnapshot, useRestoreDbSnapshot } from '../../api/useDatabases';
import type { DbConnection } from '../../api/databases.schema';

interface SnapshotsPanelProps {
  connection: DbConnection;
}

export function SnapshotsPanel({ connection }: SnapshotsPanelProps) {
  const dataDir = connection.dataDir;
  const { data: snapshots = [], isLoading } = useDbSnapshots(dataDir);
  const createSnap = useCreateDbSnapshot();
  const restoreSnap = useRestoreDbSnapshot();

  const [label, setLabel] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dataDir || !label.trim()) return;
    createSnap.mutate(
      { serviceName: connection.driver, dataDir, label: label.trim() },
      {
        onSuccess: () => {
          setLabel('');
          setIsCreating(false);
        },
      },
    );
  };

  const handleRestore = (snapPath: string, snapLabel: string) => {
    if (!dataDir) return;
    if (
      confirm(
        `Restore database to branch "${snapLabel}"? A safety backup of the current state will be preserved.`,
      )
    ) {
      restoreSnap.mutate({ serviceName: connection.driver, dataDir, snapshotPath: snapPath });
    }
  };

  if (!dataDir) {
    return (
      <div className="bg-surface-elevated border-border-subtle space-y-3 rounded-xl border p-8 text-center">
        <HardDrive className="mx-auto h-8 w-8 text-zinc-500" />
        <div className="text-sm font-medium">No Local Data Directory Configured</div>
        <p className="text-text-muted mx-auto max-w-sm text-xs">
          APFS Instant Branching requires a local data directory path (e.g.{' '}
          <code>/opt/homebrew/var/postgresql@16</code>).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & Create Branch */}
      <div className="bg-surface-elevated border-border-subtle flex items-center justify-between rounded-xl border p-4">
        <div>
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-purple-400" />
            <h2 className="text-sm font-semibold">APFS Copy-on-Write Branches</h2>
          </div>
          <p className="text-text-muted mt-0.5 text-xs">
            Instantaneous zero-copy snapshots of <code>{dataDir}</code> via macOS APFS.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-500"
        >
          <Plus className="h-3.5 w-3.5" />
          New Branch
        </button>
      </div>

      {/* Creation Modal / Inline Form */}
      {isCreating && (
        <form
          onSubmit={handleCreate}
          className="bg-surface-subtle border-border-subtle space-y-3 rounded-xl border p-4"
        >
          <div className="text-xs font-semibold">Create New Database Branch</div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Branch label (e.g. before-migration-v2)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="bg-surface-elevated border-border-subtle text-text-primary flex-1 rounded-md border px-3 py-1.5 text-xs focus:outline-none"
            />
            <button
              type="submit"
              disabled={createSnap.isPending || !label.trim()}
              className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
            >
              {createSnap.isPending ? 'Cloning APFS...' : 'Create Snapshot'}
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="text-text-muted hover:text-text-primary rounded-md px-3 py-1.5 text-xs font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Snapshots List */}
      <div className="border-border-subtle bg-surface-elevated divide-border-subtle divide-y overflow-hidden rounded-xl border">
        {isLoading ? (
          <div className="text-text-muted p-6 text-center text-xs">Scanning APFS branches...</div>
        ) : snapshots.length === 0 ? (
          <div className="space-y-2 p-8 text-center">
            <AlertCircle className="mx-auto h-6 w-6 text-zinc-500" />
            <div className="text-text-muted text-xs">
              No snapshots created yet. Create a branch before testing risky migrations.
            </div>
          </div>
        ) : (
          snapshots.map((s) => {
            const kb = Math.round(s.sizeBytes / 1024);
            const sizeStr = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
            const dateStr = new Date(s.createdAt * 1000).toLocaleString();
            return (
              <div
                key={s.id}
                className="hover:bg-surface-subtle/30 flex items-center justify-between p-3.5 px-4 transition-colors"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-text-primary text-xs font-semibold">{s.label}</span>
                    <span className="rounded bg-zinc-500/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                      {sizeStr}
                    </span>
                  </div>
                  <div className="text-text-muted font-mono text-[11px]">{dateStr}</div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRestore(s.path, s.label)}
                  disabled={restoreSnap.isPending}
                  className="bg-surface-subtle border-border-subtle flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-purple-500/10 hover:text-purple-400"
                >
                  <RotateCcw className="h-3 w-3" />
                  Restore
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
