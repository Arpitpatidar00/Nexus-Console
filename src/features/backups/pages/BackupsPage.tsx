import { HardDriveDownload, Trash2, RefreshCw, FolderArchive, Lock } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { useBackupHistory, useDeleteBackup } from '../api/useBackups';

export const BackupsPage = () => {
  const { data: backups = [], isLoading, refetch } = useBackupHistory();
  const deleteBackupMutation = useDeleteBackup();

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
            <HardDriveDownload className="h-6 w-6 text-success" />
            Automated Backups & Secret Archives
          </h1>
          <p className="mt-1 text-xs text-fg-muted">
            Local & remote database snapshots streamed over SSH pipe with strict 0600 file
            permissions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="warning"
            className="border-warning-soft bg-warning-soft px-2.5 py-1 text-xs text-warning"
          >
            Coming back after safety review
          </Badge>
        </div>
      </div>

      {/* Safety Freeze Callout */}
      <div className="flex items-start gap-3 rounded-lg border border-warning-soft bg-warning-soft p-4 text-xs text-warning">
        <Lock className="h-5 w-5 shrink-0 text-warning" />
        <div>
          <span className="font-bold">Coming back after safety review (T-01, T-19):</span>
          <p className="mt-0.5 text-warning">
            Database dump and environment archiving features are temporarily frozen while shell-free
            argv streaming pipelines, destination validation, and strict 0600 atomic file creation
            are put in place.
          </p>
        </div>
      </div>

      {/* Security Callout Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-success-soft bg-success-soft p-4 text-xs text-success">
        <Lock className="h-5 w-5 shrink-0 text-success" />
        <div>
          <span className="font-bold">Zero-Remote-Persistence Security:</span>
          <p className="mt-0.5 text-success">
            When backing up remote servers, database dumps are streamed directly through the
            encrypted SSH pipeline into local storage. Dump files are never written to the remote
            filesystem, preventing leakage on shared servers. Locally created archives are locked to
            permissions <code className="rounded bg-muted px-1 py-0.5 font-mono">0600</code>{' '}
            (read/write by owner only).
          </p>
        </div>
      </div>

      {/* Backups Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-card/40 shadow-sm">
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-fg">
            <FolderArchive className="h-4 w-4 text-success" />
            Backup Archives ({backups.length})
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40 font-semibold text-fg-muted">
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
                <td colSpan={7} className="px-4 py-8 text-center text-fg-muted">
                  Loading backup history...
                </td>
              </tr>
            ) : backups.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-fg-muted">
                  No backup archives yet.
                </td>
              </tr>
            ) : (
              backups.map((bk) => (
                <tr key={bk.id} className="transition-colors hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-fg">{bk.source_name}</div>
                    <div className="font-mono text-[10px] text-fg-muted">{bk.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="neutral" className="text-[10px] uppercase">
                      {bk.source_type}
                    </Badge>
                  </td>
                  <td
                    className="max-w-xs truncate px-4 py-3 font-mono text-[11px] text-fg-muted"
                    title={bk.target_file}
                  >
                    {bk.target_file}
                  </td>
                  <td className="px-4 py-3 font-mono text-fg">{formatBytes(bk.size_bytes)}</td>
                  <td className="px-4 py-3 text-fg-muted">
                    {new Date(bk.created_at * 1000).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        bk.status === 'completed' || bk.status === 'success'
                          ? 'success'
                          : 'destructive'
                      }
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
                      className="text-fg-muted hover:text-destructive"
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
    </div>
  );
};
