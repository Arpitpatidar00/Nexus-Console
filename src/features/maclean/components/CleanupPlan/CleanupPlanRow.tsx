import { ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatBytes } from '@/shared/lib/format';
import { Checkbox } from '@/shared/ui/Checkbox';
import { isCleanable } from '@/features/maclean/utils/storage';
import { CleanupPlanStatus } from './CleanupPlanStatus';
import type { CleanupPlanRowProps } from './CleanupPlan.types';

export const CleanupPlanRow = ({
  item,
  live,
  selected,
  expanded,
  cleaning,
  onToggleSelect,
  onToggleExpand,
}: CleanupPlanRowProps) => {
  const can = isCleanable(item);

  return (
    <li className={cn('px-5 py-2.5', !can && 'opacity-70')}>
      <div className="flex items-center gap-3">
        <Checkbox
          ariaLabel={`Clean ${item.label}`}
          checked={can && selected}
          disabled={!can || cleaning}
          onChange={() => onToggleSelect(item.id)}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm text-fg">{item.label}</span>
            {item.detail.length > 0 && (
              <button
                type="button"
                aria-expanded={expanded}
                aria-label={`What's in ${item.label}`}
                onClick={() => onToggleExpand(item.id)}
                className="rounded p-0.5 text-fg-subtle hover:bg-list hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ChevronRight
                  className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')}
                />
              </button>
            )}
          </div>
          {item.note && <p className="text-xs text-fg-subtle">{item.note}</p>}
        </div>
        <div className="flex w-56 shrink-0 justify-end">
          <CleanupPlanStatus item={item} live={live} />
        </div>
        <span className="w-20 shrink-0 text-right text-sm text-fg-muted tabular-nums">
          {item.bytes > 0 ? formatBytes(item.bytes) : '—'}
        </span>
      </div>
      {expanded && (
        <ul className="mt-1.5 ml-8 space-y-0.5 text-xs text-fg-muted">
          {item.detail.map((d) => (
            <li key={d} className="truncate font-mono" title={d}>
              {d}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};
