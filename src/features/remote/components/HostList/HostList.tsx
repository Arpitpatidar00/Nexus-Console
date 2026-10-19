import type { RemoteHost } from '@/features/remote/api/remote.schema';
import { groupHosts } from '@/features/remote/utils/grouping';
import { HostRow } from '@/features/remote/components/HostRow';

/** Master list: one section per project, prod last inside each. */
export const HostList = ({
  hosts,
  activeId,
  onSelect,
}: {
  hosts: RemoteHost[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) => (
  <div className="min-h-0 flex-1 overflow-y-auto">
    {groupHosts(hosts).map((g) => (
      <section key={g.project} aria-label={g.project}>
        <h3 className="sticky top-0 z-[1] border-b border-border bg-paper px-4 pt-3 pb-1.5 text-xs font-medium text-fg-subtle">
          {g.project}
        </h3>
        {g.hosts.map((h) => (
          <HostRow key={h.id} host={h} active={h.id === activeId} onSelect={() => onSelect(h.id)} />
        ))}
      </section>
    ))}
  </div>
);
