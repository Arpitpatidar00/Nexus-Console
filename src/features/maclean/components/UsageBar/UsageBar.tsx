import { cn } from '@/shared/lib/cn';
import type { Tone } from '@/features/maclean/utils/storage';

const FILL: Record<Tone | 'neutral', string> = {
  neutral: 'bg-accent',
  ok: 'bg-running-dot',
  warn: 'bg-warn-dot',
  danger: 'bg-danger-dot',
};

/** Decorative bar: the numbers next to it carry the information. */
export const UsageBar = ({
  pct,
  tone = 'neutral',
  className,
}: {
  pct: number;
  tone?: Tone | 'neutral';
  className?: string;
}) => (
  <div aria-hidden className={cn('h-1.5 overflow-hidden rounded-full bg-list', className)}>
    <div
      className={cn(
        'h-full rounded-full transition-[width] duration-[var(--duration-slow)]',
        FILL[tone],
      )}
      style={{ width: `${Math.min(100, Math.max(pct > 0 ? 0.6 : 0, pct))}%` }}
    />
  </div>
);
