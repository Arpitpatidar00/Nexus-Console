import { cn } from '@/shared/lib/cn';
import { formatBytes } from '@/shared/lib/format';
import type { ArchiverProjectsListProps } from './ArchiverProjectsList.types';

const ListSkeleton = () => (
  <div aria-hidden>
    {Array.from({ length: 6 }, (_, i) => (
      <div key={i} className="px-3 py-3">
        <div className="h-4 w-36 animate-pulse rounded bg-list" />
        <div className="mt-1.5 h-3 w-52 animate-pulse rounded bg-list" />
      </div>
    ))}
  </div>
);

export const ArchiverProjectsList = ({
  rows,
  selectedId,
  isPending,
  onSelect,
}: ArchiverProjectsListProps) => {
  return (
    // The surrounding Panel owns the title and frame — a second bordered box
    // and "Projects" heading inside it was the doubled-up spacing.
    <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1">
      {isPending ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <p className="px-3 py-4 text-sm text-fg-muted">Nothing in ~/.claude/projects.</p>
      ) : (
        rows.map((r) => {
          const isSelected = selectedId === r.id;
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(r.id)}
              className={cn(
                'block w-full rounded-lg px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-inset',
                isSelected ? 'bg-ember-soft' : 'hover:bg-list',
              )}
            >
              <span
                className={cn(
                  'block truncate text-sm font-medium',
                  isSelected ? 'text-ember-text' : 'text-fg',
                )}
              >
                {r.displayName}
              </span>
              <span className="block truncate text-xs text-fg-subtle">{r.subtitle}</span>
              <span className="block text-xs text-fg-muted tabular-nums">
                {r.live?.sessions ?? 0} live · {r.archived?.chats.length ?? 0} archived
                {r.live?.cacheBytes != null && ` · ${formatBytes(r.live.cacheBytes)} cache`}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
};
