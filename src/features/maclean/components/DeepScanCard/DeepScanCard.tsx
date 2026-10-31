import { useState } from 'react';
import { ExternalLink, KeyRound, ShieldAlert, Sparkles } from 'lucide-react';
import { formatBytes } from '@/shared/lib/format';
import { IpcError } from '@/shared/tauri';
import { Button } from '@/shared/ui/Button';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Spinner } from '@/shared/ui/Spinner';
import { useDeepScan, useOpenFullDiskAccess } from '@/features/maclean/api/macleanMutations';
import { Card } from '@/features/maclean/components/Card';
import { CausesList } from '@/features/maclean/components/CausesList';
import { DeepScanCategoryRow } from './DeepScanCategoryRow';
import { DeepScanEntryRow } from './DeepScanEntryRow';
import type { DeepScanCardProps } from './DeepScanCard.types';

const CATEGORY_COLORS: Record<string, string> = {
  snapshots_purgeable: 'bg-success',
  current_user: 'bg-chart-4',
  other_users: 'bg-chart-5',
  developer: 'bg-info',
  system_data: 'bg-muted-foreground',
  shared_apps_lib: 'bg-chart-1',
  installer_leftovers: 'bg-warning',
  vm_swap: 'bg-chart-3',
  unindexed_restricted: 'bg-destructive',
};

/** The script's `--deep`. Explains "Other users & system data". */
export const DeepScanCard = ({ unexplainedBytes, dataUsedBytes }: DeepScanCardProps) => {
  const deep = useDeepScan();
  const openFda = useOpenFullDiskAccess();
  const cancelled = deep.error instanceof IpcError && deep.error.kind === 'cancelled';
  const [expandedId, setExpandedId] = useState<string | null>('snapshots_purgeable');

  const categories = deep.data?.categories ?? [];
  const purgeableBytes = deep.data?.purgeableBytes ?? 0;
  const permissionDeniedCount =
    deep.data?.permissionDeniedPaths?.length ??
    categories.reduce((acc, c) => acc + c.permissionBlockedCount, 0);

  const toggleCategory = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <>
      <Card
        title="Inside the Data volume"
        aside={
          <Button
            size="sm"
            variant="secondary"
            disabled={deep.isPending}
            onClick={() => deep.mutate()}
          >
            {deep.isPending ? (
              <Spinner className="text-current" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            {deep.data ? 'Run again' : 'Deep scan…'}
          </Button>
        }
      >
        {deep.data ? (
          <div className="space-y-0">
            {/* 1. Top Summary Bar */}
            <div className="border-b border-border/60 bg-card/40 px-5 pt-4 pb-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-fg">Volume Used:</span>
                  <span className="font-mono font-medium text-fg tabular-nums">
                    {formatBytes(dataUsedBytes)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {purgeableBytes > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/15 px-2 py-0.5 text-xs font-semibold text-success tabular-nums">
                      <Sparkles className="h-3 w-3" />
                      {formatBytes(purgeableBytes)} Reclaimable
                    </span>
                  )}
                </div>
              </div>

              {/* Multi-Segment Color-Coded Volume Bar */}
              {categories.length > 0 && (
                <div className="mt-3 space-y-2">
                  <div
                    aria-hidden
                    className="flex h-2.5 w-full overflow-hidden rounded-full border border-hairline bg-muted"
                  >
                    {categories
                      .filter((c) => c.totalBytes > 0)
                      .map((cat) => {
                        const widthPct = dataUsedBytes ? (cat.totalBytes * 100) / dataUsedBytes : 0;
                        return (
                          <div
                            key={cat.id}
                            className={`h-full transition-all duration-300 ${CATEGORY_COLORS[cat.id] || 'bg-muted-foreground'}`}
                            style={{ width: `${Math.max(0.8, widthPct)}%` }}
                            title={`${cat.title}: ${formatBytes(cat.totalBytes)} (${widthPct.toFixed(1)}%)`}
                          />
                        );
                      })}
                  </div>

                  {/* Visual Legend */}
                  <div className="text-2xs flex flex-wrap gap-x-3 gap-y-1 pt-1 text-fg-subtle">
                    {categories
                      .filter((c) => c.totalBytes > 0)
                      .slice(0, 5)
                      .map((cat) => (
                        <div key={cat.id} className="flex items-center gap-1">
                          <span
                            className={`h-2 w-2 rounded-full ${CATEGORY_COLORS[cat.id] || 'bg-muted-foreground'}`}
                          />
                          <span className="max-w-[120px] truncate">{cat.title}</span>
                          <span className="font-mono tabular-nums">
                            {formatBytes(cat.totalBytes)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* 2. FDA banner — only when Stackroost really lacks Full Disk Access */}
            {deep.data.fullDiskAccess === false && (
              <div className="mx-5 my-3 flex flex-col items-start justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-fg sm:flex-row sm:items-center">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <div className="space-y-1">
                    <p className="font-semibold text-warning">
                      Partial scan — Stackroost doesn’t have Full Disk Access
                    </p>
                    <p className="text-fg-muted">
                      Protected folders (Mail, Messages, app containers) weren’t measured and are
                      counted under <strong className="text-fg">Unattributed space</strong>. Grant
                      access, quit and reopen Stackroost, then run the deep scan again.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0 text-xs font-medium whitespace-nowrap"
                  onClick={() => openFda.mutate()}
                  disabled={openFda.isPending}
                >
                  <ExternalLink className="mr-1 h-3.5 w-3.5" />
                  Grant Full Disk Access
                </Button>
              </div>
            )}

            {deep.data.fullDiskAccess !== false && permissionDeniedCount > 0 && (
              <p className="mx-5 my-3 text-xs text-fg-muted">
                {permissionDeniedCount} protected folders in other accounts or system data can’t be
                read by any app, even with Full Disk Access; their size is in{' '}
                <strong className="text-fg">Unattributed space</strong>.
              </p>
            )}

            {/* 3. Categories Accordion List */}
            {categories.length > 0 ? (
              <ul className="divide-y divide-border">
                {categories.map((category) => (
                  <DeepScanCategoryRow
                    key={category.id}
                    category={category}
                    dataUsedBytes={dataUsedBytes}
                    isOpen={expandedId === category.id}
                    onToggle={() => toggleCategory(category.id)}
                    onRescan={() => deep.mutate()}
                  />
                ))}
              </ul>
            ) : (
              /* Fallback for legacy format if categories are not present */
              <ul className="divide-y divide-border">
                {deep.data.entries.map((entry) => (
                  <DeepScanEntryRow key={entry.label} entry={entry} dataUsedBytes={dataUsedBytes} />
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-2 px-5 py-4 text-sm text-fg-muted">
            {deep.isPending ? (
              <p>Measuring system folders as administrator. This takes a couple of minutes…</p>
            ) : (
              <>
                <p>
                  {formatBytes(unexplainedBytes)} isn’t broken down yet: other accounts, app
                  containers, system data and snapshots.
                </p>
                <p className="text-xs text-fg-subtle">
                  macOS asks for your password once. The deep scan only measures sizes; it never
                  changes or deletes anything.
                </p>
                {cancelled && <p className="text-xs">Cancelled. Nothing was measured.</p>}
              </>
            )}
          </div>
        )}
        {deep.isError && !cancelled && (
          <div className="px-5 pb-4">
            <ErrorPanel error={deep.error} fallback="The deep scan failed" />
          </div>
        )}
      </Card>
      {deep.data && deep.data.causes.length > 0 && <CausesList causes={deep.data.causes} />}
    </>
  );
};
