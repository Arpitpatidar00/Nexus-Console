import { Dialog } from '@/shared/ui/Dialog';
import { formatTime } from '@/shared/lib/format';
import { useRemoteJournal } from '@/features/remote/api/useRemoteState';
import { EnvBadge } from '@/features/remote/components/EnvBadge';

const ACTION_LABEL: Record<string, string> = {
  'docker.start': 'Started',
  'docker.stop': 'Stopped',
  'docker.restart': 'Restarted',
  'docker.remove': 'Removed',
};

/** Every change Stackroost made on a server, straight from remote.json. */
export const JournalDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { data, isPending } = useRemoteJournal(open);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Server history"
      description="Every change Stackroost made on a server. Checks are read-only and aren't listed."
    >
      {isPending ? (
        <div aria-hidden className="space-y-3 py-1">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-list" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-fg-muted">No changes yet.</p>
      ) : (
        <ul className="max-h-80 divide-y divide-border overflow-y-auto">
          {data.map((e, i) => (
            <li key={`${e.atEpoch}-${i}`} className="flex items-baseline gap-3 py-2">
              <span className="w-32 shrink-0 text-xs text-fg-subtle tabular-nums">
                {formatTime(e.atEpoch * 1000)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm text-fg">
                  <span className="truncate">
                    {ACTION_LABEL[e.action] ?? e.action}{' '}
                    <span className="font-mono">{e.target}</span>
                  </span>
                  {e.result === 'error' && (
                    <span className="shrink-0 text-xs font-medium text-danger">failed</span>
                  )}
                </p>
                <p className="flex items-center gap-1.5 truncate text-xs text-fg-muted">
                  {e.hostLabel} <EnvBadge env={e.env} />
                </p>
                {e.message && <p className="truncate text-xs text-danger">{e.message}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
};
