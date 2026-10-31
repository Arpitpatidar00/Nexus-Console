import { useState } from 'react';
import { FolderOpen, RotateCw, Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatBytes } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import { Checkbox } from '@/shared/ui/Checkbox';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Spinner } from '@/shared/ui/Spinner';
import { useReveal } from '@/features/maclean/api/macleanMutations';
import type { AppSpot, SpotKind } from '@/features/maclean/api/storageTools.schema';
import { useAppDataScan, useCleanAppData } from '@/features/maclean/api/useStorageTools';
import { Card } from '@/features/maclean/components/Card';
import { ShortcutBar } from '@/features/maclean/components/ShortcutBar';
import { appDataSelection } from '@/features/maclean/utils/shortcuts';
import { CleanSummaryBanner } from '@/features/maclean/components/CleanSummaryBanner';
import { appDataSelectedBytes, idleLabel } from '@/features/maclean/utils/storageTools';
import { useNow } from '@/shared/lib/useNow';

/** What each kind costs to delete, in the order worth reading. */
const SECTIONS: { kind: SpotKind; title: string; blurb: string }[] = [
  {
    kind: 'agentBackup',
    title: 'AI agent backups',
    blurb:
      'Copies of your files an agent kept so it could undo a task. Remove once you’re happy with what it did.',
  },
  {
    kind: 'cache',
    title: 'Caches',
    blurb: 'Each app rebuilds these as you use it. Quit the app first.',
  },
  {
    kind: 'appManaged',
    title: 'Managed by the app',
    blurb:
      'The app’s own runtime data. Stackroost explains it and shows it in Finder, but leaves deleting it to the app.',
  },
  {
    kind: 'models',
    title: 'Downloaded models',
    blurb: 'Remove them with the tool’s own command, shown under each.',
  },
  {
    kind: 'history',
    title: 'History & archives',
    blurb: 'Your data. Shown so you know where the space is; never deleted here.',
  },
];

const SpotRow = ({
  spot,
  selected,
  busy,
  onToggle,
  onReveal,
}: {
  spot: AppSpot;
  selected: ReadonlySet<string>;
  busy: boolean;
  onToggle: (target: string, on: boolean) => void;
  onReveal: (path: string) => void;
}) => {
  const now = useNow() / 1000;
  const cache = spot.kind === 'cache';
  return (
    <li className="px-5 py-2.5">
      <div className="flex items-start gap-3">
        {cache ? (
          <span className="mt-0.5">
            <Checkbox
              ariaLabel={`Clear ${spot.label}`}
              checked={selected.has(spot.id)}
              disabled={busy || spot.running}
              onChange={(on) => onToggle(spot.id, on)}
            />
          </span>
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="text-sm font-medium text-fg">{spot.label}</span>
            {spot.running && (
              <span className="rounded bg-warning-soft px-1.5 text-[11px] font-medium text-warning">
                {spot.app} is open — quit it to clear
              </span>
            )}
          </div>
          <p className="text-xs text-fg-subtle">{spot.note}</p>
          {spot.paths[0] && (
            <button
              type="button"
              onClick={() => onReveal(spot.paths[0])}
              className="mt-0.5 flex max-w-full cursor-pointer items-center gap-1 truncate font-mono text-xs text-fg-subtle hover:text-fg hover:underline"
              title="Show in Finder"
            >
              <FolderOpen className="size-3 shrink-0" aria-hidden />
              {spot.paths[0]}
              {spot.paths.length > 1 && ` +${spot.paths.length - 1}`}
            </button>
          )}
        </div>
        <span className="w-20 shrink-0 text-right text-sm text-fg-muted tabular-nums">
          {formatBytes(spot.bytes)}
        </span>
      </div>
      {spot.children.length > 0 && (
        <ul className="mt-2 ml-7 divide-y divide-hairline rounded-lg border border-hairline">
          {spot.children.map((c) => (
            <li key={c.path} className="flex items-center gap-3 px-3 py-1.5 text-sm">
              <Checkbox
                ariaLabel={`Remove ${c.label}`}
                checked={selected.has(c.path)}
                disabled={busy}
                onChange={(on) => onToggle(c.path, on)}
              />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-mono text-xs text-fg">{c.label}</span>
                <span className="ml-2 text-xs text-fg-subtle">
                  from {idleLabel(c.modifiedEpoch, now)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onReveal(c.path)}
                className="cursor-pointer text-xs text-fg-subtle hover:text-fg hover:underline"
              >
                Show
              </button>
              <span className="w-20 text-right text-fg-muted tabular-nums">
                {formatBytes(c.bytes)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

/** The big per-app folders the cleanup plan doesn't cover — AI tools, chat
 * apps, models, VMs — grouped by what deleting them costs. */
export const AppDataPanel = () => {
  const scan = useAppDataScan(true);
  const clean = useCleanAppData();
  const reveal = useReveal();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const r = scan.data;

  if (scan.error) {
    return (
      <ErrorPanel
        error={scan.error}
        fallback="Couldn't measure app data"
        onRetry={() => void scan.refetch()}
      />
    );
  }
  if (!r) {
    return (
      <Card
        title="Apps & AI tools"
        aside={<span className="text-xs text-fg-subtle">Measuring app folders…</span>}
      >
        <Skeleton lines={6} className="px-5 py-4" />
      </Card>
    );
  }

  const toggle = (t: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(t);
      else next.delete(t);
      return next;
    });
  const total = appDataSelectedBytes(r, selected);
  const same = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
    a.size > 0 && a.size === b.size && [...a].every((x) => b.has(x));
  const caches = appDataSelection(r, 'caches');
  const backups = appDataSelection(r, 'backups');
  const both = new Set([...caches, ...backups]);
  const open = r.spots.filter((x) => x.kind === 'cache' && x.running).map((x) => x.app);
  const shortcuts = [
    {
      label: 'All caches',
      hint: open.length
        ? `Every cache of a closed app. Skipped while open: ${open.join(', ')}.`
        : 'Every app cache listed — apps rebuild them.',
      bytes: appDataSelectedBytes(r, caches),
      active: same(selected, caches),
      onClick: () => setSelected(caches),
    },
    {
      label: 'All agent backups',
      hint: 'Every AI agent task backup. Those tasks can no longer be undone from their backup.',
      bytes: appDataSelectedBytes(r, backups),
      active: same(selected, backups),
      onClick: () => setSelected(backups),
    },
    {
      label: 'Both',
      bytes: appDataSelectedBytes(r, both),
      active: same(selected, both),
      onClick: () => setSelected(both),
    },
  ];
  const all = r.spots.reduce((s, x) => s + x.bytes, 0);

  return (
    <div className="space-y-4">
      {clean.data && <CleanSummaryBanner result={clean.data} />}
      <Card
        title="Apps & AI tools"
        aside={
          <span className="flex items-center gap-3">
            <span className="text-xs text-fg-subtle tabular-nums">
              {formatBytes(all)} in {r.spots.length} places · {formatBytes(r.cleanableBytes)}{' '}
              clearable
            </span>
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Rescan app data"
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
        {r.cleanableBytes > 0 && (
          <ShortcutBar
            label="One click:"
            shortcuts={shortcuts}
            onClear={selected.size > 0 ? () => setSelected(new Set()) : undefined}
            className="border-b border-hairline px-5 py-2.5"
          />
        )}
        {r.spots.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-fg-muted">No large app data found.</p>
        )}
        {SECTIONS.map((sec) => {
          const spots = r.spots.filter((s) => s.kind === sec.kind);
          if (spots.length === 0) return null;
          return (
            <section key={sec.kind} className="border-b border-hairline last:border-b-0">
              <div className="flex items-baseline justify-between gap-3 px-5 pt-3 pb-1">
                <h3 className="text-xs font-semibold text-fg">{sec.title}</h3>
                <span className="text-xs text-fg-subtle tabular-nums">
                  {formatBytes(spots.reduce((s, x) => s + x.bytes, 0))}
                </span>
              </div>
              <p className="px-5 text-xs text-fg-subtle">{sec.blurb}</p>
              <ul className="divide-y divide-border">
                {spots.map((s) => (
                  <SpotRow
                    key={s.id}
                    spot={s}
                    selected={selected}
                    busy={clean.isPending}
                    onToggle={toggle}
                    onReveal={(p) => reveal.mutate(p)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
          <p className="text-sm text-fg-muted tabular-nums">
            Selected <span className="font-semibold text-fg">{formatBytes(total)}</span>
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
    </div>
  );
};
