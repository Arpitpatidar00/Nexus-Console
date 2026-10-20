import { TrendingDown, TrendingUp, History, HardDrive } from 'lucide-react';
import { formatBytes } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/Badge';
import { useStorageTrends } from '@/features/maclean/api/useMacHealth';

export const WeeklyTrendsCard = () => {
  const { data: trends, isLoading } = useStorageTrends();

  if (isLoading || !trends || trends.records.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-paper p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-accent-soft flex h-10 w-10 items-center justify-center rounded-lg text-accent">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-fg">Weekly Storage Trends</h3>
            <p className="text-xs text-fg-muted">
              Rolling 90-day history will build automatically as you run daily storage scans.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const delta = trends.weeklyFreeDeltaBytes;
  const isFreeSpaceGained = delta >= 0;
  const absDelta = Math.abs(delta);

  return (
    <div className="rounded-xl border border-border bg-paper p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-accent-soft flex h-10 w-10 items-center justify-center rounded-lg text-accent">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-fg">Weekly Storage Trends</h3>
            <p className="text-xs text-fg-muted">
              Week-over-week disk headroom change and fastest growing categories
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="neutral" className="text-xs">
            {trends.records.length} snapshots recorded
          </Badge>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Headroom Delta Card */}
        <div className="bg-subtle flex flex-col justify-between rounded-lg border border-border p-4">
          <span className="text-xs font-medium text-fg-muted">Week-over-Week Free Space</span>
          <div className="mt-2 flex items-center gap-2">
            {isFreeSpaceGained ? (
              <TrendingUp className="h-5 w-5 text-emerald-500" />
            ) : (
              <TrendingDown className="h-5 w-5 text-amber-500" />
            )}
            <span
              className={`text-xl font-bold ${isFreeSpaceGained ? 'text-emerald-500' : 'text-amber-500'}`}
            >
              {isFreeSpaceGained ? '+' : '-'}
              {formatBytes(absDelta)}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-fg-muted">
            {isFreeSpaceGained
              ? 'Your disk gained free space compared to 7 days ago.'
              : 'Disk consumption increased compared to 7 days ago.'}
          </p>
        </div>

        {/* Top Growers */}
        <div className="bg-subtle rounded-lg border border-border p-4 md:col-span-2">
          <span className="mb-2 block text-xs font-medium text-fg-muted">
            Top Category Changes (This Week vs Last Week)
          </span>
          {trends.biggestGrowers.length === 0 ? (
            <p className="py-2 text-xs text-fg-muted">
              No category divergence measured yet across available daily snapshots.
            </p>
          ) : (
            <div className="divide-y divide-border/40">
              {trends.biggestGrowers.slice(0, 4).map((grower) => (
                <div
                  key={grower.category}
                  className="flex items-center justify-between py-1.5 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-fg capitalize">
                      {grower.category.replace(/_/g, ' ')}
                    </span>
                    <span className="font-mono text-[10px] text-fg-muted">
                      (total: {formatBytes(grower.currentBytes)})
                    </span>
                  </div>
                  <span
                    className={`font-mono text-xs font-semibold ${
                      grower.deltaBytes > 0
                        ? 'text-amber-500'
                        : grower.deltaBytes < 0
                          ? 'text-emerald-500'
                          : 'text-fg-muted'
                    }`}
                  >
                    {grower.deltaBytes > 0 ? '+' : ''}
                    {formatBytes(grower.deltaBytes)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
