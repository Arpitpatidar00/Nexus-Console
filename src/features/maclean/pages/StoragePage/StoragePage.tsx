import { useState } from 'react';
import { ChevronRight, History, RotateCw, X } from 'lucide-react';
import { formatBytes, formatTime } from '@/shared/lib/format';
import { IpcError } from '@/shared/tauri';
import { Button } from '@/shared/ui/Button';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { useAppDataScan, useProjectsScan } from '@/features/maclean/api/useStorageTools';
import { ProjectsPanel } from '@/features/maclean/components/ProjectsPanel';
import { AppDataPanel } from '@/features/maclean/components/AppDataPanel';
import { isCleanable } from '@/features/maclean/utils/storage';
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
import { CleanSummaryBanner } from '@/features/maclean/components/CleanSummaryBanner';
import { StorageSkeleton } from '@/features/maclean/components/StorageSkeleton';
import { WeeklyTrendsCard } from '@/features/maclean/components/WeeklyTrendsCard';
import { GhostLeftoversCard } from '@/features/maclean/components/GhostLeftoversCard';
import { DuplicateFilesCard } from '@/features/maclean/components/DuplicateFilesCard';
import { ConsentGate } from '@/shared/privacy';

type Tab = 'overview' | 'cleanup' | 'projects' | 'apps' | 'files';

/** One line per tool: how much it can give back, one click from its tab.
 * Projects and Apps & AI show a size once they've been scanned this session. */
const WhereToLook = ({ cleanable, onOpen }: { cleanable: number; onOpen: (t: Tab) => void }) => {
  const projects = useProjectsScan(false).data;
  const apps = useAppDataScan(false).data;
  const rows: { tab: Tab; title: string; what: string; bytes: number | null }[] = [
    {
      tab: 'cleanup',
      title: 'Clean up',
      what: 'Caches, logs, Docker and tool leftovers',
      bytes: cleanable,
    },
    {
      tab: 'projects',
      title: 'Projects',
      what: 'node_modules, .next, target, Pods, .venv in your project folders',
      bytes: projects ? projects.totalBytes - projects.protectedBytes : null,
    },
    {
      tab: 'apps',
      title: 'Apps & AI tools',
      what: 'AI agent backups, app caches, VMs and models',
      bytes: apps ? apps.cleanableBytes : null,
    },
    {
      tab: 'files',
      title: 'Files',
      what: 'Large files, duplicates, leftovers of uninstalled apps',
      bytes: null,
    },
  ];
  return (
    <section className="overflow-hidden rounded-xl shadow-edge glass">
      <h2 className="border-b border-hairline px-5 py-3.5 font-display text-sm font-semibold text-foreground">
        Where space can come back from
      </h2>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.tab}>
            <button
              type="button"
              onClick={() => onOpen(r.tab)}
              className="flex w-full cursor-pointer items-center gap-3 px-5 py-3 text-left hover:bg-list focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-fg">{r.title}</span>
                <span className="block truncate text-xs text-fg-subtle">{r.what}</span>
              </span>
              <span className="text-sm text-fg-muted tabular-nums">
                {r.bytes == null ? 'Open to scan' : `${formatBytes(r.bytes)} reclaimable`}
              </span>
              <ChevronRight className="size-4 text-fg-subtle" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

/** Storage, as tools: an overview of the disk, then one tab per kind of space
 * you can get back. Every deletion is chosen here and confirmed natively in Rust. */
const StorageView = () => {
  const [tab, setTab] = useState<Tab>('overview');
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
          {tab !== 'projects' && tab !== 'apps' && (
            <>
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
            </>
          )}
        </div>
      </header>
      {scanning && (
        <UsageBar pct={p ? (p.done * 100) / p.total : 2} className="h-0.5 shrink-0 rounded-none" />
      )}
      <div className="shrink-0 border-b border-border px-6 py-2.5">
        <SegmentedControl<Tab>
          ariaLabel="Storage section"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'cleanup', label: 'Clean up' },
            { value: 'projects', label: 'Projects' },
            { value: 'apps', label: 'Apps & AI' },
            { value: 'files', label: 'Files' },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[90rem] space-y-4 p-6">
          {tab === 'projects' ? (
            <ProjectsPanel />
          ) : tab === 'apps' ? (
            <AppDataPanel />
          ) : report.isError && !cancelled && !r ? (
            <ErrorPanel error={report.error} fallback="The scan failed" onRetry={report.rescan} />
          ) : !r ? (
            cancelled ? (
              <p className="text-sm text-fg-muted">Scan cancelled. Nothing was measured.</p>
            ) : (
              <StorageSkeleton />
            )
          ) : (
            <>
              {clean.data && tab === 'cleanup' && <CleanSummaryBanner result={clean.data} />}
              {tab === 'overview' && (
                <>
                  <DiskSummary disk={r.disk} lastClean={journal.data?.[0]} />
                  <WhereToLook
                    cleanable={r.items.filter(isCleanable).reduce((n, i) => n + i.bytes, 0)}
                    onOpen={setTab}
                  />
                  {r.causes.length > 0 && <CausesList causes={r.causes} />}
                  <WeeklyTrendsCard />
                  <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
                    <StorageMap report={r} />
                    <VolumesList report={r} />
                  </div>
                  <WorthALook insights={r.insights} />
                </>
              )}
              {tab === 'cleanup' && (
                <CleanupPlan
                  key={r.scannedAt}
                  items={r.items}
                  cleaning={clean.isPending}
                  onClean={(ids) => clean.mutate(ids)}
                />
              )}
              {tab === 'files' && (
                <>
                  {r.largeFiles.length > 0 && <LargeFiles files={r.largeFiles} />}
                  <DuplicateFilesCard />
                  <GhostLeftoversCard />
                  <DeepScanCard
                    unexplainedBytes={r.map.find((m) => m.id === 'other')?.bytes ?? 0}
                    dataUsedBytes={r.disk.dataUsedBytes}
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>
      <CleanJournalDialog open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
};

export const StoragePage = () => (
  <ConsentGate
    source="library_scan"
    reason="Storage measures folder sizes under ~/Library (caches, logs, app leftovers) to show what can be cleaned. It reads sizes and names only, never file contents."
  >
    <StorageView />
  </ConsentGate>
);
