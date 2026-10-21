import { cn } from '@/shared/lib/cn';
import { formatBytes } from '@/shared/lib/format';
import type { ArchiverProjectsListProps } from './ArchiverProjectsList.types';

const ListSkeleton = () => (
  <div aria-hidden>
    {Array.from({ length: 6 }, (_, i) => (
      <div key={i} className="border-b border-border px-4 py-3 last:border-b-0">
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
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-paper">
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-fg">Projects</h2>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isPending ? (
          <ListSkeleton />
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-fg-muted">Nothing in ~/.claude/projects.</p>
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
                  'block w-full border-b border-border px-4 py-2.5 text-left transition-colors last:border-b-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-inset',
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
    </section>
  );
};
