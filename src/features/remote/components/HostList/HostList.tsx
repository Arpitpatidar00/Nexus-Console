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
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
      {groupHosts(hosts).map((g) => (
        <section key={g.project} aria-label={g.project} className="space-y-1">
          <p className="sr-eyebrow px-2 pt-1 pb-1 text-muted-foreground">{g.project}</p>
          <div className="space-y-1">
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
