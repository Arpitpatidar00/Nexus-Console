import { Server } from 'lucide-react';
import type { RemoteHost } from '@/features/remote/api/remote.schema';
import { useHostConnection } from '@/features/remote/api/useHostConnection';
import { useCachedSnapshot } from '@/features/remote/api/useHostSnapshot';
import { healthOf, issueCount } from '@/features/remote/utils/health';
import { hostAddress } from '@/features/remote/utils/host';
import { EnvBadge } from '@/shared/ui/Badge';
import { cn } from '@/shared/lib/cn';
import { describeStatus, DOT } from '@/features/remote/components/HostStatus';

/** Two lines in a 340px column: the name owns line 1, status + address share
 * line 2. Two pill badges on the right used to squeeze names down to "gi…".
 * Dev/Other carry no env chip — only the environments worth noticing do. */
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
  const address = hostAddress(host);
  const showEnv = host.env === 'prod' || host.env === 'staging';

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      title={`${host.label} · ${address}`}
      className={cn(
        'flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        active
          ? 'border-ember/60 bg-ember-soft'
          : 'border-transparent hover:border-hairline hover:bg-list',
      )}
    >
      <span className="relative flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Server className="size-4" />
        <span
          aria-hidden
          className={cn(
            'absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-popover',
            DOT[status.tone],
          )}
        />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={cn('truncate text-sm font-medium', active ? 'text-ember-text' : 'text-fg')}
          >
            {host.label}
          </span>
          {showEnv && <EnvBadge env={host.env} className="h-5 shrink-0 px-1.5 text-[10px]" />}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="shrink-0">{status.label}</span>
          <span aria-hidden className="shrink-0 opacity-50">
            ·
          </span>
          <span className="truncate font-mono">{address}</span>
        </span>
      </span>
    </button>
  );
};
