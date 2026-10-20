import { Server } from 'lucide-react';
import type { RemoteHost } from '@/features/remote/api/remote.schema';
import { useHostConnection } from '@/features/remote/api/useHostConnection';
import { useCachedSnapshot } from '@/features/remote/api/useHostSnapshot';
import { healthOf, issueCount } from '@/features/remote/utils/health';
import { hostAddress } from '@/features/remote/utils/host';
import { EnvBadge, Badge } from '@/shared/ui/Badge';
import { ListRow } from '@/shared/ui/ListRow';
import { describeStatus, type Tone } from '@/features/remote/components/HostStatus';

const TONE_TO_BADGE: Record<Tone, 'neutral' | 'warning' | 'success' | 'danger'> = {
  neutral: 'neutral',
  pending: 'warning',
  ok: 'success',
  warn: 'warning',
  danger: 'danger',
};

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
    <ListRow
      icon={<Server className="size-4" />}
      title={host.label}
      subtitle={hostAddress(host)}
      active={active}
      onClick={onSelect}
      className="mb-1 cursor-pointer"
      trailing={
        <div className="flex shrink-0 items-center gap-1.5">
          <EnvBadge env={host.env} />
          <Badge tone={TONE_TO_BADGE[status.tone]} dot size="sm">
            {status.label}
          </Badge>
        </div>
      }
    />
  );
};
