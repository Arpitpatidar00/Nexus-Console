import { cn } from '@/shared/lib/cn';
import type { RemoteHost } from '@/features/remote/api/remote.schema';
import { useHostConnection } from '@/features/remote/api/useHostConnection';
import { useCachedSnapshot } from '@/features/remote/api/useHostSnapshot';
import { healthOf, issueCount } from '@/features/remote/utils/health';
import { hostAddress } from '@/features/remote/utils/host';
import { EnvBadge } from '@/features/remote/components/EnvBadge';
import { HostStatus, describeStatus } from '@/features/remote/components/HostStatus';

export const HostRow = ({
  host,
  active,
  onSelect,
}: {
  host: RemoteHost;
  active: boolean;
  onSelect: () => void;
}) => {
  const conn = useHostConnection(host.id);
  const snap = useCachedSnapshot(host.id).data;
  const status = describeStatus(conn.state, healthOf(snap), issueCount(snap), conn.error?.kind);

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        'block w-full border-b border-border px-4 py-2.5 text-left transition-colors last:border-b-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
        active ? 'bg-accent-soft' : 'hover:bg-list',
      )}
    >
      <span className="flex items-center gap-2">
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm font-medium',
            active ? 'text-accent' : 'text-fg',
          )}
        >
          {host.label}
        </span>
        <EnvBadge env={host.env} />
      </span>
      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
        <HostStatus {...status} />
        {host.label !== hostAddress(host) && (
          <span className="min-w-0 truncate text-fg-subtle">· {hostAddress(host)}</span>
        )}
      </span>
    </button>
  );
};
