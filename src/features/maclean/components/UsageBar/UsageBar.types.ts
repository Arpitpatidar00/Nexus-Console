import type { Tone } from '@/features/maclean/utils/storage';

export interface UsageBarProps {
  pct: number;
  tone?: Tone | 'neutral';
  className?: string;
}
