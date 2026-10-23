import { useState } from 'react';
import { HardDrive, Trash2, CheckCircle, FileText } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { ProdConfirmDialog } from '@/features/remote/components/ProdConfirmDialog';
import type { RemoteHost } from '@/features/remote/api/remote.schema';
import {
  useServerDiskReport,
  usePruneBuilder,
  usePruneImages,
} from '@/features/remote/api/useServerDisk';

interface Props {
  host: RemoteHost;
  connected: boolean;
}

export const ServerDiskPanel = ({ host, connected }: Props) => {
  const { data: report, isLoading, error, refetch } = useServerDiskReport(host.id, connected);
  const pruneBuilder = usePruneBuilder(host.id);
  const pruneImages = usePruneImages(host.id);

  const [confirmPrune, setConfirmPrune] = useState<'builder' | 'images' | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handlePruneConfirm = async () => {
    if (!confirmPrune) return;
    try {
      if (confirmPrune === 'builder') {
        const res = await pruneBuilder.mutateAsync();
        setSuccessMsg(res.message);
      } else {
        const res = await pruneImages.mutateAsync();
        setSuccessMsg(res.message);
      }
    } catch {
      // handled by mutation error state
    } finally {
      setConfirmPrune(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-12">
        <Spinner className="size-6 text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorPanel
          error={error}
          fallback="Failed to load disk breakdown"
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
      {successMsg && (
        <div className="flex items-center justify-between rounded-xl border border-success-soft bg-success-soft px-4 py-3 text-success">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle className="size-4" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            className="cursor-pointer text-xs underline hover:text-success"
            onClick={() => setSuccessMsg(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Docker Layer Breakdown */}
      <div className="rounded-2xl border border-hairline bg-card/50 p-5 shadow-sm backdrop-blur-sm">
        <div className="flex items-center justify-between pb-4">
          <div className="flex items-center gap-3">
            <HardDrive className="size-6 text-primary" />
            <div>
              <h3 className="font-semibold text-fg">Docker Storage Usage</h3>
              <p className="text-xs text-fg-subtle">
                Breakdown of container images, volumes, and builder layers from docker system df
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pruneBuilder.isPending}
              onClick={() => setConfirmPrune('builder')}
            >
              <Trash2 className="mr-1.5 size-3.5 text-warning" />
              Prune Build Cache
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pruneImages.isPending}
              onClick={() => setConfirmPrune('images')}
            >
              <Trash2 className="mr-1.5 size-3.5 text-destructive" />
              Prune Dangling Images
            </Button>
          </div>
        </div>

        <div className="divide-y divide-hairline rounded-xl border border-hairline bg-canvas/60">
          <div className="grid grid-cols-5 px-4 py-2.5 text-xs font-semibold text-fg-subtle">
            <span className="col-span-2">TYPE</span>
            <span>TOTAL</span>
            <span>ACTIVE</span>
            <span>SIZE (RECLAIMABLE)</span>
          </div>
          {report.dockerSpace.map((item) => (
            <div key={item.itemType} className="grid grid-cols-5 items-center px-4 py-3 text-sm">
              <span className="col-span-2 font-medium text-fg">{item.itemType}</span>
              <span className="font-mono text-xs text-fg-muted">{item.total}</span>
              <span className="font-mono text-xs text-fg-muted">{item.active}</span>
              <div>
                <span className="font-mono text-xs font-semibold text-fg">{item.size}</span>
                {item.reclaimable !== '0B' && (
                  <span className="ml-1.5 font-mono text-xs text-success">
                    ({item.reclaimable})
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Largest logs under /var/log, plus the journal's own total */}
      {report.largeLogs.length > 0 && (
        <div className="rounded-2xl border border-hairline bg-card/50 p-5 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-3 pb-4">
            <FileText className="size-6 text-muted-foreground" />
            <div>
              <h3 className="font-semibold text-fg">Largest logs</h3>
              <p className="text-xs text-fg-subtle">{report.journalDiskUsage}</p>
            </div>
          </div>

          <div className="divide-y divide-hairline rounded-xl border border-hairline bg-canvas/60">
            {report.largeLogs.map(([path, size]) => (
              <div key={path} className="flex items-center justify-between px-4 py-3">
                <span className="font-mono text-sm text-fg">{path}</span>
                <span className="font-mono text-xs font-semibold text-fg-muted">{size}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {confirmPrune && (
        <ProdConfirmDialog
          hostLabel={host.label}
          title={
            confirmPrune === 'builder' ? 'Prune Docker Build Cache?' : 'Prune Dangling Images?'
          }
          description={
            confirmPrune === 'builder'
              ? `Remove unused Docker build cache layers on ${host.label}? Active containers and images will not be affected.`
              : `Remove untagged and dangling Docker images on ${host.label}? Tagged and running images will not be affected.`
          }
          actionLabel={confirmPrune === 'builder' ? 'Prune Cache' : 'Prune Images'}
          danger={host.env === 'prod'}
          onConfirm={() => void handlePruneConfirm()}
          onCancel={() => setConfirmPrune(null)}
        />
      )}
    </div>
  );
};
