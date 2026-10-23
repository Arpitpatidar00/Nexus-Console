import { useState } from 'react';
import { FolderSearch, Lock, RotateCw, Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatBytes } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import { Checkbox } from '@/shared/ui/Checkbox';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Spinner } from '@/shared/ui/Spinner';
import { useReveal } from '@/features/maclean/api/macleanMutations';
import { useCleanProjects, useProjectsScan } from '@/features/maclean/api/useStorageTools';
import { Card } from '@/features/maclean/components/Card';
import { ShortcutBar } from '@/features/maclean/components/ShortcutBar';
import { artifactSelection } from '@/features/maclean/utils/shortcuts';
import { CleanSummaryBanner } from '@/features/maclean/components/CleanSummaryBanner';
import {
  idleBuckets,
  idleDays,
  idleLabel,
  idleSelection,
  projectState,
  selectedBytes,
} from '@/features/maclean/utils/storageTools';

const BUCKETS = [90, 30, 7];

/** Every project's rebuildable output — node_modules, .next, target, Pods,
 * .venv… — with when the project was last worked on and what brings it back.
 * Delete what you're not using; `npm install` (or the shown command) restores it. */
export const ProjectsPanel = () => {
  const scan = useProjectsScan(true);
  const clean = useCleanProjects();
  const reveal = useReveal();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stack, setStack] = useState<string | null>(null);
  const r = scan.data;
  const now = Date.now() / 1000;

  const toggle = (paths: string[], on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      for (const p of paths) {
        if (on) next.add(p);
        else next.delete(p);
      }
      return next;
    });

  if (scan.error) {
    return (
      <ErrorPanel
        error={scan.error}
        fallback="Couldn't scan your projects"
        onRetry={() => void scan.refetch()}
      />
    );
  }
  if (!r) {
    return (
      <Card
        title="Projects"
        aside={
          <span className="text-xs text-fg-subtle">Looking through your project folders…</span>
        }
      >
        <Skeleton lines={8} className="px-5 py-4" />
      </Card>
    );
  }

  const stacks = [...new Set(r.projects.flatMap((p) => p.stacks))].sort();
  const shown = r.projects.filter((p) => !stack || p.stacks.includes(stack));
  const total = selectedBytes(r, selected);
  const deletable = r.totalBytes - r.protectedBytes;
  const protectedRules = [...new Set(r.projects.map((p) => p.protectedBy).filter(Boolean))];
  const same = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
    a.size > 0 && a.size === b.size && [...a].every((x) => b.has(x));
  const pick = (label: string, sel: Set<string>, hint: string) => ({
    label,
    hint,
    bytes: selectedBytes(r, sel),
    active: same(selected, sel),
    onClick: () => setSelected(sel),
  });
  const shortcuts = [
    ...idleBuckets(r, now, BUCKETS).map((b) =>
      pick(
        `Untouched ${b.days}+ days`,
        idleSelection(r, b.days, now),
        `Every folder in projects nobody touched for ${b.days} days or more.`,
      ),
    ),
    pick(
      'Build output only',
      artifactSelection(r, 'buildOutput'),
      '.next, target, build and tool caches — quick to rebuild. Dependencies stay.',
    ),
    pick(
      'All dependencies',
      artifactSelection(r, 'dependencies'),
      'node_modules, .venv, Pods — reinstalled with npm install, pip install, pod install.',
    ),
    pick(
      'Everything unprotected',
      artifactSelection(r, 'everything'),
      'All rebuildable folders outside your protected projects.',
    ),
  ];

  return (
    <div className="space-y-4">
      {clean.data && <CleanSummaryBanner result={clean.data} />}
      <Card
        title="Projects"
        aside={
          <span className="flex items-center gap-3">
            <span className="text-xs text-fg-subtle tabular-nums">
              {r.projects.length} projects in {r.roots.join(', ')} · {formatBytes(deletable)}{' '}
              rebuildable
            </span>
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Rescan projects"
              title="Rescan"
              disabled={scan.isFetching || clean.isPending}
              onClick={() => {
                setSelected(new Set());
                void scan.refetch();
              }}
            >
              <RotateCw
                className={cn(scan.isFetching && 'animate-spin motion-reduce:animate-none')}
              />
            </Button>
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-2.5 text-xs">
          <ShortcutBar
            label="One click:"
            shortcuts={shortcuts}
            onClear={selected.size > 0 ? () => setSelected(new Set()) : undefined}
          />
          {stacks.length > 1 && (
            <span className="ml-auto flex items-center gap-1">
              {[null, ...stacks].map((s) => (
                <button
                  key={s ?? 'all'}
                  type="button"
                  onClick={() => setStack(s)}
                  aria-pressed={stack === s}
                  className={cn(
                    'cursor-pointer rounded-full px-2.5 py-1',
                    stack === s ? 'bg-list text-fg' : 'text-fg-subtle hover:text-fg',
                  )}
                >
                  {s ?? 'All'}
                </button>
              ))}
            </span>
          )}
        </div>

        {shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-fg-muted">
            No build output found in {r.roots.join(', ')}. Add more project folders in Settings →
            Mac Clean.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((p) => {
              const locked = p.protectedBy != null;
              const state = projectState(p, selected);
              const deletablePaths = p.artifacts.filter((a) => !a.blocked).map((a) => a.path);
              const days = idleDays(p.lastActiveEpoch, now);
              return (
                <li key={p.path} className={cn('px-5 py-2.5', locked && 'opacity-75')}>
                  <div className="flex items-center gap-3">
                    {locked ? (
                      <span
                        className="flex size-4 items-center justify-center"
                        title={`Protected by your rule “${p.protectedBy}”`}
                      >
                        <Lock className="size-3.5 text-fg-subtle" aria-label="Protected" />
                      </span>
                    ) : (
                      <Checkbox
                        ariaLabel={`Select ${p.name}`}
                        checked={state === 'all'}
                        disabled={clean.isPending || deletablePaths.length === 0}
                        onChange={(on) => toggle(deletablePaths, on)}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="truncate text-sm font-medium text-fg">{p.name}</span>
                        {p.stacks.map((s) => (
                          <span
                            key={s}
                            className="rounded bg-list px-1.5 text-[11px] text-fg-muted"
                          >
                            {s}
                          </span>
                        ))}
                        <span
                          className={cn('text-xs', days <= 1 ? 'text-warning' : 'text-fg-subtle')}
                        >
                          {days <= 1
                            ? `worked on ${idleLabel(p.lastActiveEpoch, now)}`
                            : `last touched ${idleLabel(p.lastActiveEpoch, now)}`}
                        </span>
                        {locked && (
                          <span className="text-xs text-fg-subtle">
                            · protected by “{p.protectedBy}”
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => reveal.mutate(p.path)}
                        title="Show in Finder"
                        className="block max-w-full cursor-pointer truncate font-mono text-xs text-fg-subtle hover:text-fg hover:underline"
                      >
                        {p.display}
                      </button>
                    </div>
                    <span className="w-20 shrink-0 text-right text-sm text-fg-muted tabular-nums">
                      {formatBytes(p.bytes)}
                    </span>
                  </div>
                  <ul className="mt-1.5 ml-7 flex flex-wrap gap-1.5">
                    {p.artifacts.map((a) => {
                      const on = selected.has(a.path);
                      const disabled = locked || !!a.blocked || clean.isPending;
                      return (
                        <li key={a.path}>
                          <label
                            title={
                              a.blocked
                                ? `Can't delete: ${a.blocked}`
                                : `Comes back with: ${a.rebuild}`
                            }
                            className={cn(
                              'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs',
                              on
                                ? 'border-ember bg-ember-soft text-ember-text'
                                : 'border-hairline text-fg-muted',
                              disabled ? 'cursor-default' : 'cursor-pointer hover:bg-list',
                            )}
                          >
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={on}
                              disabled={disabled}
                              onChange={(e) => toggle([a.path], e.target.checked)}
                            />
                            <span className="font-mono">{a.name}</span>
                            <span className="tabular-nums">{formatBytes(a.bytes)}</span>
                            <span className="text-fg-subtle">· {a.rebuild}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
          <p className="text-sm text-fg-muted tabular-nums">
            Selected <span className="font-semibold text-fg">{formatBytes(total)}</span>
            {selected.size > 0 && ` in ${selected.size} folder${selected.size === 1 ? '' : 's'}`}
            {r.protectedBytes > 0 && (
              <span className="text-fg-subtle">
                {' '}
                · {formatBytes(r.protectedBytes)} held back by{' '}
                {protectedRules.map((x) => `“${x}”`).join(', ')} (Settings → Mac Clean)
              </span>
            )}
          </p>
          <Button
            size="sm"
            disabled={total === 0 || clean.isPending}
            onClick={() => clean.mutate([...selected], { onSuccess: () => setSelected(new Set()) })}
          >
            {clean.isPending ? (
              <Spinner className="text-current" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete selected…
          </Button>
        </footer>
      </Card>
      <p className="flex items-start gap-2 px-1 text-xs text-fg-subtle">
        <FolderSearch className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Only folders each project's own tools recreate. Source code, .git and .env files are never
        touched, and projects you worked on in the last day are flagged — close their dev servers
        before deleting.
      </p>
    </div>
  );
};
