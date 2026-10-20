import { useMemo, useState } from 'react';
import { usePackages, usePackagesOutdated } from '@/features/packages/api/usePackages';
import { useUpgradePackage, useUpgradeAll } from '@/features/packages/api/packageMutations';
import { useServices } from '@/shared/brew';
import { Spinner } from '@/shared/ui/Spinner';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Panel } from '@/shared/ui/Panel';
import {
  PackagesToolbar,
  type PackageFilter,
} from '@/features/packages/components/PackagesToolbar';
import { PackagesTable } from '@/features/packages/components/PackagesTable';
import { BrewInfoPanel } from '@/features/packages/components/BrewInfoPanel';
import { UninstallDialog } from '@/features/packages/components/UninstallDialog';

export const PackagesPage = () => {
  const { data, isPending, isError, error, isFetching, refetch } = usePackages();
  const { data: outdated } = usePackagesOutdated();
  const { data: services } = useServices();
  const upgrade = useUpgradePackage();
  const upgradeAll = useUpgradeAll();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PackageFilter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [uninstallTarget, setUninstallTarget] = useState<string | null>(null);

  const serviceNames = useMemo(() => new Set((services ?? []).map((s) => s.name)), [services]);

  const packages = useMemo(() => {
    if (!data) return [];
    const byName = new Map((outdated ?? []).map((o) => [o.name, o]));
    return data.map((p) => {
      const o = byName.get(p.name);
      return o ? { ...p, outdated: true, latestVersion: o.latestVersion, pinned: o.pinned } : p;
    });
  }, [data, outdated]);

  const upgradingName = upgrade.isPending ? upgrade.variables?.name : undefined;

  const outdatedCount = useMemo(
    () => packages.filter((p) => p.outdated && !p.pinned).length,
    [packages],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return packages.filter((p) => {
      if (filter === 'formula' && p.kind !== 'formula') return false;
      if (filter === 'cask' && p.kind !== 'cask') return false;
      if (filter === 'outdated' && !p.outdated) return false;
      return !q || p.name.toLowerCase().includes(q);
    });
  }, [packages, query, filter]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Top action header */}
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-4">
        <p className="sr-caption tabular-nums">
          Homebrew · {packages.length} installed · {outdatedCount} outdated
        </p>
        <PackagesToolbar
          query={query}
          onQueryChange={setQuery}
          filter={filter}
          onFilterChange={setFilter}
          outdatedCount={outdatedCount}
          onUpgradeAll={() => upgradeAll.mutate()}
          isUpgradingAll={upgradeAll.isPending}
          onRefresh={() => void refetch()}
          isFetching={isFetching}
        />
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <Panel className="min-w-0 flex-1 gap-0 overflow-hidden p-0">
          {isPending ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : isError ? (
            <div className="m-6">
              <ErrorPanel
                error={error}
                fallback="Failed to list packages"
                onRetry={() => void refetch()}
              />
            </div>
          ) : (
            <PackagesTable
              packages={filtered}
              serviceNames={serviceNames}
              onSelect={setSelected}
              onUninstall={setUninstallTarget}
              onUpgrade={(name) => upgrade.mutate({ name })}
              upgradingName={upgradingName}
            />
          )}
        </Panel>

        {selected && (
          <Panel className="w-96 shrink-0 overflow-y-auto p-4">
            <BrewInfoPanel name={selected} onClose={() => setSelected(null)} />
          </Panel>
        )}
      </div>

      <UninstallDialog name={uninstallTarget} onClose={() => setUninstallTarget(null)} />
    </div>
  );
};
