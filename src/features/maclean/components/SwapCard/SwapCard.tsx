import { RotateCcw } from 'lucide-react';
import { formatBytes, formatDuration } from '@/shared/lib/format';
import { Sparkline } from '@/shared/ui/Sparkline';
import { Card } from '@/features/maclean/components/Card';
import { UsageBar } from '@/features/maclean/components/UsageBar';
import { swapState } from '@/features/maclean/utils/memory';
import type { SwapCardProps } from './SwapCard.types';

export const SwapCard = ({ report, history }: SwapCardProps) => {
  const state = swapState(report);
  const used = report.swapTotalBytes ? (report.swapUsedBytes * 100) / report.swapTotalBytes : 0;

  return (
    <Card
      title="Swap"
      aside={
        <span className="flex items-center gap-2 text-xs text-fg-muted">
          <Sparkline values={history.map((h) => h.swapPct)} />
          <span className="tabular-nums">
            {formatBytes(report.swapUsedBytes)} of {formatBytes(report.swapTotalBytes)}
          </span>
        </span>
      }
    >
      <div className="space-y-3 px-5 py-4 text-sm">
        <UsageBar pct={used} tone={state === 'active' ? 'warn' : 'neutral'} />
        {state === 'active' ? (
          <p>
            <span className="font-semibold text-warn">Swapping now</span>{' '}
            <span className="text-fg-muted tabular-nums">
              (~{formatBytes(Math.round(report.swapoutBytesPerSec ?? 0))}/s written to disk). This
              is what makes a Mac feel slow: quit something big, or add memory headroom.
            </span>
          </p>
        ) : state === 'leftover' ? (
          <p className="text-fg-muted">
            <span className="font-semibold text-fg">Nothing is being swapped right now.</span> The{' '}
            {formatBytes(report.swapUsedBytes)} in swap is left over from earlier and isn’t slowing
            you down. It clears when you restart.
          </p>
        ) : (
          <p className="text-fg-muted">No swap in use.</p>
        )}
        <p className="text-xs text-fg-subtle tabular-nums">
          Up {formatDuration(report.uptimeSecs)}
        </p>
        {report.restartSuggested && (
          <p className="flex items-start gap-2 rounded-lg border border-border bg-canvas px-3 py-2 text-xs text-fg-muted">
            <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Over 2 GB of swap after more than a week up: a restart would give it back.
          </p>
        )}
      </div>
    </Card>
  );
};
