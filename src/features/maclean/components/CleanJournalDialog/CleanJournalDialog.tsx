import { Dialog } from '@/shared/ui/Dialog';
import { formatBytes, formatTime } from '@/shared/lib/format';
import { useCleanJournal } from '@/features/maclean/api/macleanMutations';

export const CleanJournalDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) => {
  const { data, isPending } = useCleanJournal(open);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cleanup history"
      description="Every clean Mac Clean has run. Scans are read-only and aren't listed."
    >
      {isPending ? (
        <div aria-hidden className="space-y-3 py-1">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-list" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-fg-muted">Nothing cleaned yet.</p>
      ) : (
        <ul className="max-h-80 divide-y divide-border overflow-y-auto">
          {data.map((e) => (
            <li key={e.atEpoch} className="space-y-0.5 py-2">
              <p className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-fg">Freed {formatBytes(e.freedBytes)}</span>
                <span className="text-xs text-fg-subtle tabular-nums">
                  {formatTime(e.atEpoch * 1000)}
                </span>
              </p>
              <p className="text-xs text-fg-muted">{e.items.join(' · ')}</p>
              {e.errors.map((err) => (
                <p key={err} className="text-xs text-danger">
                  {err}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
};
