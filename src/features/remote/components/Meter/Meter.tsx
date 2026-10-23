import { cn } from '@/shared/lib/cn';

interface MeterProps {
  label: string;
  /** 0–100. `null` = no data (renders an empty track, not a fake zero). */
  pct: number | null;
  /** The numbers, always shown: a bar alone is colour-only information. */
  detail: string;
  warnAt?: number;
  critAt?: number;
}

/** A labelled usage bar. Neutral until a threshold, then warn/danger. */
export const Meter = ({ label, pct, detail, warnAt = 85, critAt = 95 }: MeterProps) => {
  const tone =
    pct == null ? '' : pct >= critAt ? 'bg-destructive' : pct >= warnAt ? 'bg-warning' : 'bg-ember';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-mono text-foreground" title={label}>
          {label}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {pct != null && <span className="text-foreground">{Math.round(pct)}% · </span>}
          {detail}
        </span>
      </div>
      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
        {pct != null && (
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300 motion-reduce:transition-none',
              tone,
            )}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        )}
      </div>
    </div>
  );
};
