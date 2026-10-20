import { Check, CircleAlert } from 'lucide-react';
import { Spinner } from '@/shared/ui/Spinner';
import type { CleanupPlanStatusProps } from './CleanupPlan.types';

export const CleanupPlanStatus = ({ item, live }: CleanupPlanStatusProps) => {
  if (live?.state === 'running') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-fg-muted">
        <Spinner className="h-3.5 w-3.5" /> Cleaning…
      </span>
    );
  }

  if (live?.state === 'done') {
    return (
      <span className="flex items-center gap-1 text-xs text-running">
        <Check className="h-3.5 w-3.5" /> Cleaned
      </span>
    );
  }

  if (live?.state === 'error') {
    return (
      <span className="flex min-w-0 items-center gap-1 text-xs text-danger" title={live.message}>
        <CircleAlert className="h-3.5 w-3.5 shrink-0" />{' '}
        <span className="truncate">{live.message}</span>
      </span>
    );
  }

  if (item.skip) {
    return <span className="truncate text-xs text-warn">Skipped: {item.skip}</span>;
  }

  if (item.bytes === 0) {
    return <span className="text-xs text-fg-subtle">Already clean</span>;
  }

  return null;
};
