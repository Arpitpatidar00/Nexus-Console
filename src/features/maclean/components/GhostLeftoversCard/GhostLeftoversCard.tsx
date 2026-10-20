import { useState } from 'react';
import {
  Ghost,
  Trash2,
  FolderSearch,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { formatBytes } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { ipcVoid, CMD } from '@/shared/tauri';
import { useGhostScan, useGhostClean } from '@/features/maclean/api/useMacHealth';

export const GhostLeftoversCard = () => {
  const { data: report, isLoading, refetch, isFetching } = useGhostScan();
  const cleanMutation = useGhostClean();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const leftovers = report?.leftovers ?? [];
  const safeItems = leftovers.filter((i) => i.isSafe);
  const possibleItems = leftovers.filter((i) => !i.isSafe);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllSafe = () => {
    if (selectedIds.size === safeItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(safeItems.map((i) => i.id)));
    }
  };

  const handleClean = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    cleanMutation.mutate(ids, {
      onSuccess: () => {
        setSelectedIds(new Set());
      },
    });
  };

  const handleReveal = (path: string) => {
    void ipcVoid(CMD.MACLEAN_REVEAL, { path });
  };

  const totalSelectedBytes = safeItems
    .filter((i) => selectedIds.has(i.id))
    .reduce((acc, curr) => acc + curr.sizeBytes, 0);

  return (
    <div className="rounded-xl border border-border bg-paper p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-accent-soft flex h-10 w-10 items-center justify-center rounded-lg text-accent">
            <Ghost className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-fg">Ghost Leftovers</h3>
            <p className="text-xs text-fg-muted">
              Remnants of uninstalled applications and dead background LaunchAgents
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? 'Scanning…' : 'Rescan'}
          </Button>
          {safeItems.length > 0 && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleClean}
              disabled={selectedIds.size === 0 || cleanMutation.isPending}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {cleanMutation.isPending
                ? 'Moving to Trash…'
                : `Trash Selected (${formatBytes(totalSelectedBytes)})`}
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-sm text-fg-muted">
          Scanning for uninstalled bundle remnants and dead LaunchAgents…
        </div>
      ) : leftovers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500" />
          <p className="text-sm font-medium text-fg">No Ghost Leftovers Found</p>
          <p className="mt-1 text-xs text-fg-muted">
            Your Caches, Preferences, and LaunchAgents are clean with no orphaned files.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between text-xs text-fg-muted">
            <div className="flex items-center gap-2">
              <span className="font-medium text-fg">
                {safeItems.length} high-confidence leftovers (
                {formatBytes(report?.totalReclaimableBytes ?? 0)} reclaimable)
              </span>
            </div>
            {safeItems.length > 0 && (
              <button
                type="button"
                onClick={selectAllSafe}
                className="font-medium text-accent hover:underline"
              >
                {selectedIds.size === safeItems.length ? 'Deselect all' : 'Select all safe'}
              </button>
            )}
          </div>

          {/* Safe leftovers list */}
          <div className="bg-subtle divide-y divide-border rounded-lg border border-border">
            {safeItems.map((item) => (
              <div
                key={item.id}
                className="hover:bg-hover flex items-center justify-between p-3 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id={`ghost-${item.id}`}
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <label
                        htmlFor={`ghost-${item.id}`}
                        className="cursor-pointer text-xs font-semibold text-fg"
                      >
                        {item.name}
                      </label>
                      <Badge variant="neutral" className="text-[10px] uppercase">
                        {item.kind.replace('_', ' ')}
                      </Badge>
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                    </div>
                    <p className="mt-0.5 max-w-xl truncate font-mono text-[11px] text-fg-muted">
                      {item.path}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-medium text-fg">{formatBytes(item.sizeBytes)}</span>
                  <p className="text-[10px] text-fg-muted">
                    {item.modifiedAt > 0
                      ? `Modified ${new Date(item.modifiedAt * 1000).toLocaleDateString()}`
                      : 'Unknown date'}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Possible leftovers (Application Support, reveal only) */}
          {possibleItems.length > 0 && (
            <div className="mt-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-fg-muted">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <span>
                  Possible Application Support Remnants (Safety policy: Reveal in Finder only)
                </span>
              </div>
              <div className="bg-subtle/50 divide-y divide-border rounded-lg border border-border">
                {possibleItems.map((item) => (
                  <div
                    key={item.id}
                    className="hover:bg-hover flex items-center justify-between p-3 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-fg">{item.name}</span>
                        <Badge variant="neutral" className="text-[10px] text-amber-500 uppercase">
                          Possible Remnant
                        </Badge>
                      </div>
                      <p className="mt-0.5 max-w-xl truncate font-mono text-[11px] text-fg-muted">
                        {item.path}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-fg">
                        {formatBytes(item.sizeBytes)}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleReveal(item.path)}
                      >
                        <FolderSearch className="mr-1.5 h-3.5 w-3.5" />
                        Reveal
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
