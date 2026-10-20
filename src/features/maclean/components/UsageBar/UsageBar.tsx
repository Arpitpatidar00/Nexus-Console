import { cn } from '@/shared/lib/cn';
import type { Tone } from '@/features/maclean/utils/storage';
import type { UsageBarProps } from './UsageBar.types';

const FILL: Record<Tone | 'neutral', string> = {
  neutral: 'bg-ember',
  ok: 'bg-success',
  warn: 'bg-warning',
  danger: 'bg-destructive',
};

/** Decorative bar: the numbers next to it carry the information. */
export const UsageBar = ({ pct, tone = 'neutral', className }: UsageBarProps) => (
  <div
    aria-hidden
    className={cn('h-2 overflow-hidden rounded-full border border-hairline bg-muted', className)}
  >
    <div
      className={cn('h-full rounded-full transition-all duration-300', FILL[tone])}
      style={{ width: `${Math.min(100, Math.max(pct > 0 ? 0.6 : 0, pct))}%` }}
    />
  </div>
);
