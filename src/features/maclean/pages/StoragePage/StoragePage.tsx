import { useState } from 'react';
import { CircleCheck, History, RotateCw, X } from 'lucide-react';
import { formatBytes, formatTime } from '@/shared/lib/format';
import { IpcError } from '@/shared/tauri';
import { Button } from '@/shared/ui/Button';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { useStorageReport } from '@/features/maclean/api/useStorageReport';
import { useClean, useCleanJournal } from '@/features/maclean/api/macleanMutations';
import { DiskSummary } from '@/features/maclean/components/DiskSummary';
import { StorageMap } from '@/features/maclean/components/StorageMap';
import { VolumesList } from '@/features/maclean/components/VolumesList';
import { CausesList } from '@/features/maclean/components/CausesList';
import { CleanupPlan } from '@/features/maclean/components/CleanupPlan';
import { WorthALook } from '@/features/maclean/components/WorthALook';
import { CleanJournalDialog } from '@/features/maclean/components/CleanJournalDialog';
import { UsageBar } from '@/features/maclean/components/UsageBar';
import { DeepScanCard } from '@/features/maclean/components/DeepScanCard';
import { LargeFiles } from '@/features/maclean/components/LargeFiles';

const Skeleton = () => (
  <div aria-hidden className="space-y-4">
    <div className="h-20 animate-pulse rounded-xl bg-list" />
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="h-80 animate-pulse rounded-xl bg-list" />
      <div className="h-80 animate-pulse rounded-xl bg-list" />
    </div>
  </div>
);

/** `~/mac-clean.sh` as a page: the report fills in from one read-only scan;
 * the only mutation is the cleanup plan's button (native confirm in Rust). */
export const StoragePage = () => {
  const report = useStorageReport();
  const clean = useClean();
  const journal = useCleanJournal(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const r = report.data;
  const scanning = report.isFetching;
  const p = report.progress;
  const cancelled = report.error instanceof IpcError && report.error.kind === 'cancelled';

  const subtitle = scanning
    ? p
      ? `Measuring ${p.label}… ${p.done}/${p.total}`
      : 'Reading disk usage…'
    : r
      ? `Scanned ${formatTime(r.scannedAt * 1000)} · ${(r.scanMs / 1000).toFixed(0)} s · read-only`
      : 'Storage report & safe cleanup';

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-fg">Storage</h1>
          <p className="truncate text-sm text-fg-muted tabular-nums">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cleanup history"
            title="History"
            onClick={() => setHistoryOpen(true)}
          >
            <History className="h-4 w-4" />
          </Button>
          {scanning ? (
            <Button variant="secondary" size="sm" onClick={report.cancel}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={clean.isPending}
              onClick={report.rescan}
            >
              <RotateCw className="h-4 w-4" />
              {r ? 'Rescan' : 'Scan'}
            </Button>
          )}
        </div>
      </header>
      {scanning && (
        <UsageBar pct={p ? (p.done * 100) / p.total : 2} className="h-0.5 shrink-0 rounded-none" />
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[90rem] space-y-4 p-6">
          {clean.data && (
            <div className="flex items-start gap-3 rounded-xl border border-running/30 bg-running-soft px-5 py-3">
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-running" />
              <div className="space-y-0.5 text-sm">
                <p className="font-semibold text-fg">Freed {formatBytes(clean.data.freedBytes)}</p>
                <p className="text-fg-muted">
                  {clean.data.items.filter((i) => i.ok).length} cleaned
                  {clean.data.items.some((i) => !i.ok) &&
                    `, ${clean.data.items.filter((i) => !i.ok).length} failed`}
                  .
                  {clean.data.items.some((i) => i.id.startsWith('docker')) &&
                    ' Docker may take a few minutes to shrink its disk image.'}
                </p>
              </div>
            </div>
          )}
          {report.isError && !cancelled && !r ? (
            <ErrorPanel error={report.error} fallback="The scan failed" onRetry={report.rescan} />
          ) : !r ? (
            cancelled ? (
              <p className="text-sm text-fg-muted">Scan cancelled. Nothing was measured.</p>
            ) : (
              <Skeleton />
            )
          ) : (
            <>
              <DiskSummary disk={r.disk} lastClean={journal.data?.[0]} />
              {r.causes.length > 0 && <CausesList causes={r.causes} />}
              <CleanupPlan
                key={r.scannedAt}
                items={r.items}
                cleaning={clean.isPending}
                onClean={(ids) => clean.mutate(ids)}
              />
              <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
                <StorageMap report={r} />
                <VolumesList report={r} />
              </div>
              <DeepScanCard
                unexplainedBytes={r.map.find((m) => m.id === 'other')?.bytes ?? 0}
                dataUsedBytes={r.disk.dataUsedBytes}
              />
              {r.largeFiles.length > 0 && <LargeFiles files={r.largeFiles} />}
              <WorthALook insights={r.insights} />
            </>
          )}
        </div>
      </div>
      <CleanJournalDialog open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
};
