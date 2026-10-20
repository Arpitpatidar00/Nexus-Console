import { useMemo, useState } from 'react';
import { LayoutGrid, Play, Plus, RefreshCw, Square } from 'lucide-react';
import { toast } from 'sonner';
import { useAppDispatch, useAppSelector } from '@/shared/state/hooks';
import { setCardOrder, setLayout, type Layout } from '@/shared/state/settingsSlice';
import { applyCardOrder, mergeVisibleOrder } from '@/features/services/utils/cardOrder';
import {
  useBulkPower,
  isRunning,
  isStartable,
  summarizeBulk,
  type BulkResult,
} from './useBulkPower';
import { useReconciledServices, type ReconciledService } from '@/shared/brew';
import { confirmBulk } from '@/shared/tauri';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Panel } from '@/shared/ui/Panel';
import { Metric } from '@/shared/ui/Metric';
import { Button } from '@/shared/ui/Button';
import { SearchField } from '@/shared/ui/SearchField';
import { SegmentedControl, type SegmentOption } from '@/shared/ui/SegmentedControl';
import { ServiceGrid } from '@/features/services/components/ServiceGrid';
import { ServiceList } from '@/features/services/components/ServiceList';
import { ConnectServiceModal } from '@/features/services/components/ConnectServiceModal';
import { cn } from '@/shared/lib/cn';

const MAX_NAMES = 8;
const nameList = (svcs: ReconciledService[]) => {
  const names = svcs.map((s) => s.displayName);
  return names.length <= MAX_NAMES
    ? names.join(', ')
    : `${names.slice(0, MAX_NAMES).join(', ')} +${names.length - MAX_NAMES} more`;
};

type FilterOption = 'all' | 'running' | 'stopped';
const FILTER_OPTIONS: SegmentOption<FilterOption>[] = [
  { value: 'all', label: 'All' },
  { value: 'running', label: 'Running' },
  { value: 'stopped', label: 'Stopped' },
];

const LAYOUT_OPTIONS: SegmentOption<Layout>[] = [
  { value: 'grid', label: 'Grid' },
  { value: 'list', label: 'List' },
];

export const ServicesPage = () => {
  const { services, isPending, isError, error, isFetching, refetch } = useReconciledServices();
  const layout = useAppSelector((s) => s.settings.layout);
  const cardOrder = useAppSelector((s) => s.settings.cardOrder);
  const dispatch = useAppDispatch();
  const bulk = useBulkPower();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterOption>('all');
  const [connectOpen, setConnectOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const ordered = useMemo(() => applyCardOrder(services, cardOrder), [services, cardOrder]);

  const runningServices = useMemo(() => services.filter(isRunning), [services]);
  const startableServices = useMemo(() => services.filter(isStartable), [services]);

  const totalMemoryMb = useMemo(() => {
    return services.reduce((acc, s) => acc + (s.memoryBytes ?? 0), 0) / (1024 * 1024);
  }, [services]);
  const totalMemoryDisplay =
    totalMemoryMb >= 1024 ? (totalMemoryMb / 1024).toFixed(1) : Math.round(totalMemoryMb);
  const totalMemoryUnit = totalMemoryMb >= 1024 ? 'GB' : 'MB';

  const filtered = useMemo(() => {
    let list = ordered;
    if (filter === 'running') list = list.filter(isRunning);
    else if (filter === 'stopped') list = list.filter((s) => !isRunning(s));
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) => s.displayName.toLowerCase().includes(q) || s.formula.toLowerCase().includes(q),
    );
  }, [ordered, filter, query]);

  const handleReorder = (visible: string[]) =>
    dispatch(setCardOrder(mergeVisibleOrder(ordered, visible)));

  const runBulk = async (verb: string, action: () => Promise<BulkResult>) => {
    setBusy(true);
    try {
      const res = await action();
      const msg = summarizeBulk(verb, res);
      if (res.failed > 0) toast.error(msg);
      else toast.success(msg);
    } finally {
      setBusy(false);
    }
  };

  const onStartAll = () => runBulk('Started', () => bulk.startMany(startableServices));

  const onStopAll = async () => {
    const confirmed = await confirmBulk({
      title: 'Stop all services',
      message: `Stop all ${runningServices.length} running service${runningServices.length === 1 ? '' : 's'}?\n${nameList(runningServices)}`,
      action: 'Stop all',
    });
    if (confirmed) await runBulk('Stopped', () => bulk.stopMany(runningServices));
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto pr-1">
      {/* Top action & filter bar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <p className="sr-caption">
            Homebrew · {services.length} managed · {runningServices.length} running
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SearchField
            placeholder="Search services and formulae"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 w-72 max-w-full"
          />

          <SegmentedControl
            ariaLabel="Filter"
            value={filter}
            options={FILTER_OPTIONS}
            onChange={setFilter}
          />

          <SegmentedControl
            ariaLabel="Layout"
            value={layout}
            options={LAYOUT_OPTIONS}
            onChange={(v) => dispatch(setLayout(v))}
          />

          <Button variant="glass" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} />
            Refresh
          </Button>

          <Button variant="ember" size="sm" onClick={() => setConnectOpen(true)}>
            <Plus className="size-4" />
            Add service
          </Button>
        </div>
      </div>

      <ConnectServiceModal open={connectOpen} onOpenChange={setConnectOpen} />

      {/* Top Bento Summary Row */}
      {services.length > 0 && (
        <div className="mb-5 grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
          <Panel
            variant="inverse"
            title="Workspace Services"
            subtitle={
              runningServices.length > 0
                ? `${runningServices.length} of ${services.length} services active. Ready for development.`
                : 'All services stopped. Start workspace services in one click.'
            }
            actionLabel={runningServices.length > 0 ? 'Stop all' : 'Start all'}
            actionIcon={
              runningServices.length > 0 ? (
                <Square className="size-3.5" />
              ) : (
                <Play className="size-3.5" />
              )
            }
            actionDisabled={busy}
            onAction={runningServices.length > 0 ? () => void onStopAll() : onStartAll}
          >
            <div className="flex flex-wrap gap-2 font-mono text-xs">
              {services.slice(0, 4).map((s) => (
                <span
                  key={s.formula}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1"
                >
                  {s.displayName}
                  {s.port ? ` → :${s.port}` : ''}
                </span>
              ))}
              {services.length > 4 && (
                <span className="rounded-full border border-white/20 px-3 py-1 text-white/70">
                  +{services.length - 4} more
                </span>
              )}
            </div>
          </Panel>

          <Panel aria-label="Services Summary">
            <div className="flex h-full flex-wrap items-center gap-8">
              <Metric
                value={runningServices.length}
                unit={`of ${services.length}`}
                label="Services running"
                tone="success"
                progress={
                  services.length > 0 ? (runningServices.length / services.length) * 100 : 0
                }
              />
              <Metric
                value={totalMemoryDisplay}
                unit={totalMemoryUnit}
                label="Memory used by services"
                tone="ember"
              />
            </div>
          </Panel>
        </div>
      )}

      {/* Main Service cards grid / list */}
      <div className="min-h-0 flex-1">
        {isPending ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-xl glass" />
            ))}
          </div>
        ) : isError && services.length === 0 ? (
          <ErrorPanel
            error={error}
            fallback="Failed to load services"
            onRetry={() => void refetch()}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<LayoutGrid className="size-10" />}
            title="No services"
            description={
              query ? 'Nothing matches your search query.' : 'Add a service to get started.'
            }
          />
        ) : layout === 'grid' ? (
          <ServiceGrid services={filtered} onReorder={handleReorder} />
        ) : (
          <ServiceList services={filtered} />
        )}
      </div>
    </div>
  );
};
