import { groupHosts } from '@/features/remote/utils/grouping';
import { HostRow } from '@/features/remote/components/HostRow';
import { HostListSkeleton } from './HostListSkeleton';
import type { HostListProps } from './HostList.types';

export const HostList = ({ hosts, activeId, isLoading, onSelect }: HostListProps) => {
  if (isLoading) {
    return <HostListSkeleton />;
  }

  if (hosts.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No servers yet.</p>;
  }

  return (
    <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
      {groupHosts(hosts).map((g) => (
        <section key={g.project} aria-label={g.project} className="space-y-1">
          <p className="flex items-center justify-between px-3 pb-0.5 text-[11px] font-semibold text-muted-foreground">
            <span className="truncate">{g.project}</span>
            <span className="shrink-0 font-normal tabular-nums">{g.hosts.length}</span>
          </p>
          <div className="space-y-0.5">
            {g.hosts.map((h) => (
              <HostRow
                key={h.id}
                host={h}
                active={h.id === activeId}
                onSelect={() => onSelect(h.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
