import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

interface MeterProps {
  label: string;
  /** 0–100. `null` = no data (renders an empty track, not a fake zero). */
  pct: number | null;
  /** The numbers, always shown: a bar alone is colour-only information. */
  detail: string;
  warnAt?: number;
  critAt?: number;
  /** Optional trend (e.g. a sparkline) shown before the numbers. */
  trend?: ReactNode;
}

/** A labelled usage bar. Neutral until a threshold, then warn/danger. */
export const Meter = ({ label, pct, detail, warnAt = 85, critAt = 95, trend }: MeterProps) => {
  const tone =
    pct == null
      ? ''
      : pct >= critAt
        ? 'bg-danger-dot'
        : pct >= warnAt
          ? 'bg-warn-dot'
          : 'bg-accent';
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate font-medium text-fg">{label}</span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-fg-muted tabular-nums">
          {trend}
          {detail}
        </span>
      </div>
      {/* Decorative: the label + numbers above carry the information. */}
      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-list">
        {pct != null && (
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-[var(--duration-slow)]',
              tone,
            )}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        )}
      </div>
    </div>
  );
};
