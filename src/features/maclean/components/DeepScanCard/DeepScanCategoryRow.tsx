import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  Download,
  ExternalLink,
  Folder,
  FolderSearch,
  Layers,
  Lock,
  PackageOpen,
  ShieldAlert,
  Sparkles,
  Terminal,
  Trash2,
  TriangleAlert,
  User,
  Users,
  Cpu,
  File,
} from 'lucide-react';
import { formatBytes } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { UsageBar } from '@/features/maclean/components/UsageBar';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import {
  useReveal,
  useOpenFullDiskAccess,
  useOpenUsersAndGroups,
  useThinSnapshots,
  useDeleteSnapshot,
  useDeletePath,
} from '@/features/maclean/api/macleanMutations';
import type { DeepSubItem } from '@/features/maclean/api/maclean.schema';
import type { DeepScanCategoryRowProps } from './DeepScanCard.types';

const tilde = (p: string) => p.replace(/^\/Users\/[^/]+/, '~');

function getCategoryIcon(id: string) {
  switch (id) {
    case 'snapshots_purgeable':
      return <Clock className="h-4 w-4 shrink-0 text-success" />;
    case 'current_user':
      return <User className="h-4 w-4 shrink-0 text-fg" />;
    case 'other_users':
      return <Users className="h-4 w-4 shrink-0 text-warning" />;
    case 'developer':
      return <Terminal className="h-4 w-4 shrink-0 text-info" />;
    case 'system_data':
      return <Database className="h-4 w-4 shrink-0 text-fg-muted" />;
    case 'shared_apps_lib':
      return <Layers className="h-4 w-4 shrink-0 text-chart-5" />;
    case 'installer_leftovers':
      return <PackageOpen className="h-4 w-4 shrink-0 text-warning" />;
    case 'vm_swap':
      return <Cpu className="h-4 w-4 shrink-0 text-chart-4" />;
    case 'unindexed_restricted':
      return <ShieldAlert className="h-4 w-4 shrink-0 text-destructive" />;
    default:
      return <Folder className="h-4 w-4 shrink-0 text-fg-muted" />;
  }
}

function getSubItemIcon(subItem: DeepSubItem) {
  if (subItem.kind === 'snapshot' || subItem.kind === 'time_machine') {
    return <Clock className="h-3.5 w-3.5 shrink-0 text-success" />;
  }
  if (subItem.kind === 'update_snapshot' || subItem.kind === 'system_update') {
    return <Download className="h-3.5 w-3.5 shrink-0 text-warning" />;
  }
  if (subItem.kind === 'cache') {
    return <Sparkles className="h-3.5 w-3.5 shrink-0 text-success" />;
  }
  if (subItem.kind === 'user') {
    return <User className="h-3.5 w-3.5 shrink-0 text-fg" />;
  }
  if (subItem.kind === 'restricted') {
    return <Lock className="h-3.5 w-3.5 shrink-0 text-destructive" />;
  }
  if (subItem.kind === 'file') {
    return <File className="h-3.5 w-3.5 shrink-0 text-fg-muted" />;
  }
  return <Folder className="h-3.5 w-3.5 shrink-0 text-fg-muted" />;
}

export const DeepScanCategoryRow = ({
  category,
  dataUsedBytes,
  isOpen,
  onToggle,
  onRescan,
}: DeepScanCategoryRowProps) => {
  const [snapshotToDelete, setSnapshotToDelete] = useState<DeepSubItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<DeepSubItem | null>(null);
  const [thinConfirmOpen, setThinConfirmOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const reveal = useReveal();
  const openFda = useOpenFullDiskAccess();
  const openUsers = useOpenUsersAndGroups();
  const thinSnapshots = useThinSnapshots();
  const deleteSnapshot = useDeleteSnapshot();
  const deletePath = useDeletePath();

  const pctOfData = dataUsedBytes ? (category.totalBytes * 100) / dataUsedBytes : 0;
  const isSnapshots = category.id === 'snapshots_purgeable';
  const snapshots = isSnapshots
    ? category.subItems.filter(
        (s) =>
          s.kind === 'snapshot' ||
          s.kind === 'time_machine' ||
          s.kind === 'update_snapshot' ||
          s.kind === 'system_update',
      )
    : [];
  const purgeableItem = isSnapshots ? category.subItems.find((s) => s.kind === 'cache') : null;

  const tone = isSnapshots
    ? 'ok'
    : category.severity === 'warning'
      ? 'warn'
      : category.severity === 'actionable'
        ? 'ok'
        : 'neutral';

  const hasThinAction = category.availableActions.includes('thin_snapshots');
  const hasFdaAction =
    category.availableActions.includes('open_full_disk_access') ||
    category.permissionBlockedCount > 0;
  const hasUsersAction = category.availableActions.includes('open_users_settings');

  const handleThinSnapshots = () => {
    thinSnapshots.mutate(undefined, {
      onSuccess: (res) => {
        setThinConfirmOpen(false);
        setStatusMessage(res || 'Snapshots thinned successfully.');
        setTimeout(() => setStatusMessage(null), 5000);
        onRescan?.();
      },
      onError: (err) => {
        setStatusMessage(`Thinning failed: ${(err as Error).message}`);
        setTimeout(() => setStatusMessage(null), 6000);
      },
    });
  };

  const handleDeleteSnapshot = () => {
    if (!snapshotToDelete) return;
    deleteSnapshot.mutate(snapshotToDelete.path, {
      onSuccess: (res) => {
        setSnapshotToDelete(null);
        setStatusMessage(res || 'Snapshot removed.');
        setTimeout(() => setStatusMessage(null), 5000);
        onRescan?.();
      },
      onError: (err) => {
        setStatusMessage(`Delete failed: ${(err as Error).message}`);
        setTimeout(() => setStatusMessage(null), 6000);
      },
    });
  };

  const handleDeleteItem = () => {
    if (!itemToDelete) return;
    deletePath.mutate(itemToDelete.path, {
      onSuccess: (res) => {
        setItemToDelete(null);
        setStatusMessage(res || 'Item removed successfully.');
        setTimeout(() => setStatusMessage(null), 5000);
        onRescan?.();
      },
      onError: (err) => {
        setStatusMessage(`Delete failed: ${(err as Error).message}`);
        setTimeout(() => setStatusMessage(null), 6000);
      },
    });
  };

  return (
    <li className="border-b border-border transition-colors last:border-b-0">
      {/* Clickable Header Row */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full px-5 py-3 text-left transition-colors hover:bg-card/50 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
      >
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-fg-subtle">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </span>
              {getCategoryIcon(category.id)}
              <span className="truncate font-medium text-fg">{category.title}</span>
              {category.permissionBlockedCount > 0 && (
                <span className="text-2xs inline-flex items-center gap-1 rounded-full border border-destructive/25 bg-destructive/15 px-2 py-0.5 font-medium text-destructive">
                  <ShieldAlert className="h-3 w-3" />
                  FDA needed ({category.permissionBlockedCount})
                </span>
              )}
              {category.severity === 'actionable' && !category.permissionBlockedCount && (
                <span className="text-2xs inline-flex items-center gap-1 rounded-full border border-success/25 bg-success/15 px-2 py-0.5 font-medium text-success">
                  Reclaimable
                </span>
              )}
              {category.severity === 'warning' && !category.permissionBlockedCount && (
                <span className="text-2xs inline-flex items-center gap-1 rounded-full border border-warning/25 bg-warning/15 px-2 py-0.5 font-medium text-warning">
                  <TriangleAlert className="h-3 w-3" />
                  Large
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-baseline gap-2">
              <span className="text-xs text-fg-subtle tabular-nums">{pctOfData.toFixed(1)}%</span>
              <span className="text-sm font-semibold text-fg tabular-nums">
                {formatBytes(category.totalBytes)}
              </span>
            </div>
          </div>

          <UsageBar pct={pctOfData} tone={tone} />

          <p className="pl-6 text-xs text-fg-subtle">{category.subtitle}</p>
        </div>
      </button>

      {/* Accordion Drill-Down Content */}
      {isOpen && (
        <div className="space-y-3 border-t border-border/50 bg-muted/30 px-5 py-3 text-xs">
          {/* Status Message Notification */}
          {statusMessage && (
            <div className="flex items-center justify-between rounded-lg border border-border/80 bg-card/90 px-3 py-2 text-xs font-medium text-fg shadow-sm">
              <span>{statusMessage}</span>
              <button
                type="button"
                onClick={() => setStatusMessage(null)}
                className="ml-2 text-fg-muted hover:text-fg"
              >
                ✕
              </button>
            </div>
          )}

          {/* Action Toolbar if actions are available for this category */}
          {(hasThinAction || hasFdaAction || hasUsersAction) && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card/60 p-2.5">
              <span className="text-2xs font-medium text-fg-subtle uppercase">Actions:</span>

              {hasThinAction && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setThinConfirmOpen(true)}
                  disabled={thinSnapshots.isPending}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5 text-success" />
                  {thinSnapshots.isPending ? 'Thinning...' : 'Thin Local Snapshots'}
                </Button>
              )}

              {hasFdaAction && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openFda.mutate()}
                  disabled={openFda.isPending}
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5 text-primary" />
                  Grant Full Disk Access
                </Button>
              )}

              {hasUsersAction && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openUsers.mutate()}
                  disabled={openUsers.isPending}
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5 text-primary" />
                  Manage in Users & Groups
                </Button>
              )}
            </div>
          )}

          {/* APFS Snapshots & Purgeable Special View */}
          {isSnapshots ? (
            <div className="space-y-3">
              {/* APFS Local Snapshots Sub-Section */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between font-medium text-fg">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-success" />
                    APFS Local Snapshots ({snapshots.length})
                  </span>
                  <span className="text-2xs text-fg-subtle">Shared copy-on-write extents</span>
                </div>

                {snapshots.length > 0 ? (
                  <ul className="divide-y divide-border/40 overflow-hidden rounded-lg border border-border/60 bg-card/60">
                    {snapshots.map((snap) => (
                      <li
                        key={snap.name}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-fg"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          {getSubItemIcon(snap)}
                          <span className="truncate font-mono text-xs" title={snap.name}>
                            {snap.name}
                          </span>
                          <span
                            className={cn(
                              'py-0.2 text-2xs rounded px-1.5 font-semibold tracking-wider uppercase',
                              snap.isDeletable
                                ? 'bg-success/15 text-success'
                                : 'bg-muted text-fg-muted',
                            )}
                          >
                            {snap.kind === 'time_machine' ? 'Time Machine' : 'Update Snapshot'}
                          </span>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {snap.isDeletable && (
                            <Button
                              size="iconSm"
                              variant="ghost"
                              className="text-fg-muted hover:bg-destructive/15 hover:text-destructive"
                              title="Delete snapshot"
                              aria-label={`Delete snapshot ${snap.name}`}
                              onClick={() => setSnapshotToDelete(snap)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="pl-5 text-fg-muted italic">
                    No active Time Machine or update snapshots found on this volume.
                  </p>
                )}
              </div>

              {/* macOS Purgeable Cache Sub-Section */}
              {purgeableItem && purgeableItem.bytes > 0 && (
                <div className="space-y-1 rounded-lg border border-border/60 bg-card/60 p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-medium text-fg">
                      <Sparkles className="h-3.5 w-3.5 text-success" />
                      macOS Evictable / Purgeable Cache
                    </span>
                    <span className="font-semibold text-success tabular-nums">
                      {formatBytes(purgeableItem.bytes)}
                    </span>
                  </div>
                  <p className="text-2xs text-fg-subtle">
                    Space held by iCloud Drive local eviction caches and temporary system
                    CacheDelete assets. macOS automatically frees this capacity when disk space is
                    needed.
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Standard File/Folder Category Sub-Items View */
            <div className="space-y-1.5">
              <div className="text-2xs flex items-center justify-between font-medium tracking-wider text-fg-subtle uppercase">
                <span>Top Contributing Items</span>
                <span>Size</span>
              </div>

              {category.subItems.length > 0 ? (
                <ul className="divide-y divide-border/40 overflow-hidden rounded-lg border border-border/60 bg-card/60">
                  {category.subItems.map((item) => {
                    const isFileSystemPath = item.path.startsWith('/') || item.path.startsWith('~');
                    return (
                      <li
                        key={item.path + item.name}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-fg transition-colors hover:bg-card/90"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          {getSubItemIcon(item)}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{item.name}</p>
                            <p
                              className="text-2xs truncate font-mono text-fg-subtle"
                              title={item.path}
                            >
                              {tilde(item.path)}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {item.isDeletable && (
                            <span className="py-0.2 text-2xs rounded bg-success/15 px-1.5 font-medium text-success">
                              Reclaimable
                            </span>
                          )}
                          {item.bytes > 0 && (
                            <span className="font-mono text-xs font-semibold text-fg-muted tabular-nums">
                              {formatBytes(item.bytes)}
                            </span>
                          )}
                          {isFileSystemPath && (
                            <Button
                              size="iconSm"
                              variant="ghost"
                              className="text-fg-subtle hover:text-fg"
                              title={`Reveal ${item.path} in Finder`}
                              aria-label={`Reveal ${item.path} in Finder`}
                              onClick={() => reveal.mutate(item.path)}
                              disabled={reveal.isPending}
                            >
                              <FolderSearch className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {item.isDeletable && isFileSystemPath && (
                            <Button
                              size="iconSm"
                              variant="ghost"
                              className="text-fg-muted hover:bg-destructive/15 hover:text-destructive"
                              title={`Delete ${item.name}`}
                              aria-label={`Delete ${item.name}`}
                              onClick={() => setItemToDelete(item)}
                              disabled={deletePath.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-fg-muted italic">No items measured in this category.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Confirmation Dialog for Thinning Snapshots */}
      <Dialog
        open={thinConfirmOpen}
        onOpenChange={setThinConfirmOpen}
        title="Thin APFS Local Snapshots"
        description="Are you sure you want to thin local APFS snapshots? macOS will purge older, reclaimable snapshot extents using tmutil to free up storage space on your disk."
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setThinConfirmOpen(false)}
              disabled={thinSnapshots.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleThinSnapshots}
              disabled={thinSnapshots.isPending}
            >
              {thinSnapshots.isPending ? 'Thinning...' : 'Thin Snapshots'}
            </Button>
          </>
        }
      >
        <p className="text-xs text-muted-foreground">
          This operation safely invokes macOS <code>tmutil thinlocalsnapshots</code>. It will not
          affect your external Time Machine backups.
        </p>
      </Dialog>

      {/* Confirmation Dialog for Deleting Individual Snapshot */}
      <Dialog
        open={Boolean(snapshotToDelete)}
        onOpenChange={(open) => !open && setSnapshotToDelete(null)}
        title="Delete Local Snapshot"
        description={`Are you sure you want to delete snapshot "${snapshotToDelete?.name}"?`}
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSnapshotToDelete(null)}
              disabled={deleteSnapshot.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteSnapshot}
              disabled={deleteSnapshot.isPending}
            >
              {deleteSnapshot.isPending ? 'Deleting...' : 'Delete Snapshot'}
            </Button>
          </>
        }
      >
        <p className="text-xs text-muted-foreground">
          This will permanently remove this local APFS snapshot from your system drive using{' '}
          <code>tmutil deletelocalsnapshots</code>.
        </p>
      </Dialog>

      {/* Confirmation Dialog for Deleting Individual File/Folder */}
      <Dialog
        open={Boolean(itemToDelete)}
        onOpenChange={(open) => !open && setItemToDelete(null)}
        title="Delete Item"
        description={`Are you sure you want to permanently delete "${itemToDelete?.name}"?`}
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setItemToDelete(null)}
              disabled={deletePath.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteItem}
              disabled={deletePath.isPending}
            >
              {deletePath.isPending ? 'Deleting...' : 'Delete Permanently'}
            </Button>
          </>
        }
      >
        <p className="font-mono text-xs break-all text-muted-foreground">{itemToDelete?.path}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          This will permanently delete this item to reclaim storage space. This action cannot be
          undone.
        </p>
      </Dialog>
    </li>
  );
};
