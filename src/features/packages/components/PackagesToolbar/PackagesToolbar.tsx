import { ArrowUpCircle, RefreshCw } from 'lucide-react';
import { SegmentedControl, type SegmentOption } from '@/shared/ui/SegmentedControl';
import { Button } from '@/shared/ui/Button';
import { SearchField } from '@/shared/ui/SearchField';
import { cn } from '@/shared/lib/cn';
import type { PackagesToolbarProps, PackageFilter } from './PackagesToolbar.types';

const FILTERS: SegmentOption<PackageFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'formula', label: 'Formulae' },
  { value: 'cask', label: 'Casks' },
  { value: 'outdated', label: 'Outdated' },
];

export const PackagesToolbar = ({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  outdatedCount,
  onUpgradeAll,
  isUpgradingAll,
  onRefresh,
  isFetching,
}: PackagesToolbarProps) => (
  <div className="flex flex-wrap items-center justify-end gap-3">
    <SearchField
      value={query}
      onChange={(e) => onQueryChange(e.target.value)}
      placeholder="Search packages..."
      className="h-11 w-56 max-w-full"
    />
    <SegmentedControl
      ariaLabel="Filter"
      value={filter}
      options={FILTERS}
      onChange={onFilterChange}
    />
    {outdatedCount > 0 && (
      <Button variant="ember" size="sm" disabled={isUpgradingAll} onClick={onUpgradeAll}>
        <ArrowUpCircle className={cn('size-4', isUpgradingAll && 'animate-spin')} />
        Upgrade all ({outdatedCount})
      </Button>
    )}
    <Button variant="glass" size="sm" onClick={onRefresh}>
      <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} />
      Refresh
    </Button>
  </div>
);
