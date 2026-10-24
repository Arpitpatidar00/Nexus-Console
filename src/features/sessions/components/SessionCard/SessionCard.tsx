import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatDuration, formatTime } from '@/shared/lib/format';
import { useLiveUptime } from '@/features/sessions/hooks/useLiveUptime';
import { iconFor } from '@/features/services/components/ServiceCard';
import { Badge } from '@/shared/ui/Badge';
import type { Run } from '@/shared/state/sessionsSlice';

interface Props {
  formula: string;
  displayName: string;
  runs: Run[];
}

export const SessionCard = ({ formula, displayName, runs }: Props) => {
  const [open, setOpen] = useState(false);
  const liveUptime = useLiveUptime(formula);
  const now = Date.now();
  const totalSecs = Math.floor(
    runs.reduce((sum, r) => sum + ((r.endMs ?? now) - r.startMs), 0) / 1000,
  );
  const Icon = iconFor(formula);

  return (
    <div className="rounded-xl shadow-edge glass transition-all hover:bg-glass-strong">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-3 p-4 text-left select-none"
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-fg">
          <Icon className="size-4" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate font-semibold text-fg">{displayName}</span>
          {liveUptime !== null && (
            <Badge tone="success" size="sm" dot>
              up {formatDuration(liveUptime)}
            </Badge>
          )}
        </div>
        <div className="shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
          <div className="font-semibold text-fg">{formatDuration(totalSecs)}</div>
          <div>Total uptime</div>
        </div>
        <div className="w-12 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
          <div className="font-semibold text-fg">{runs.length}</div>
          <div>Runs</div>
        </div>
        {runs.length > 0 ? (
          open ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="size-4 shrink-0" />
        )}
      </button>

      {open && runs.length > 0 && (
        <div className="border-t border-hairline px-4 py-3">
          <div className="space-y-1.5 font-mono text-xs">
            {runs.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-muted-foreground">
                <span>{formatTime(r.startMs)}</span>
                <span>
                  {r.endMs
                    ? `ran for ${formatDuration((r.endMs - r.startMs) / 1000)}`
                    : 'currently running'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
