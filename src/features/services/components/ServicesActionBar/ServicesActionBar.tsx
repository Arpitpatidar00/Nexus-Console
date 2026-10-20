import { Play, Plus, Square } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import type { ServicesActionBarProps } from './ServicesActionBar.types';

export const ServicesActionBar = ({
  hasBrew,
  runningCount,
  allStopped,
  busy,
  onStartAll,
  onStopAll,
  onAdd,
}: ServicesActionBarProps) => {
  if (!hasBrew) return null;

  return (
    <div className="flex items-center justify-end gap-2 border-b border-border bg-paper px-6 py-2.5 text-sm">
      {runningCount > 0 ? (
        <Button size="sm" variant="dangerOutline" disabled={busy} onClick={onStopAll}>
          <Square className="h-4 w-4" />
          Stop all
        </Button>
      ) : (
        allStopped && (
          <Button size="sm" variant="primaryOutline" disabled={busy} onClick={onStartAll}>
            <Play className="h-4 w-4" />
            Start all
          </Button>
        )
      )}
      {(runningCount > 0 || allStopped) && <div aria-hidden className="h-6 w-px bg-border" />}
      <Button size="sm" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        Add
      </Button>
    </div>
  );
};
