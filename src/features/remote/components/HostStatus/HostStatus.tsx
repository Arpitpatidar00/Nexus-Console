import { cn } from '@/shared/lib/cn';
import { DOT, type Tone } from './HostStatus.config';

export const HostStatus = ({ tone, label }: { tone: Tone; label: string }) => (
  <span className="inline-flex min-w-0 items-center gap-1.5">
    <span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT[tone])} />
    <span className="truncate">{label}</span>
  </span>
);
