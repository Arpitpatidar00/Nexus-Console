import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/shared/state/hooks';
import { setMacleanAutoCleanDays, setMacleanLowDiskGb } from '@/shared/state/settingsSlice';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { Button } from '@/shared/ui/Button';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Input } from '@/shared/ui/Field';
// Deep imports: the maclean barrel would chain StoragePage into Settings' chunk.
import { useCleanRules, useSetCleanRules } from '@/features/maclean/api/macleanMutations';
import type { CleanRules } from '@/features/maclean/api/maclean.schema';

// One row shape for every setting: copy grows and wraps, the control keeps its
// size and right edge — the old mix let segmented controls squeeze the text.
const rowCls = 'flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3.5';
const copyCls = 'min-w-0 flex-1 basis-64';

const list = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/** The script's settings block, editable. Loaded once, so the form starts
 * from what Rust enforces. */
const Form = ({ rules }: { rules: CleanRules }) => {
  const save = useSetCleanRules();
  const [names, setNames] = useState(rules.protectedNames.join(', '));
  const [roots, setRoots] = useState(rules.projectRoots.join(', '));
  const [days, setDays] = useState({
    nextIdleDays: String(rules.nextIdleDays),
    logAgeDays: String(rules.logAgeDays),
    staleNodeModulesDays: String(rules.staleNodeModulesDays),
  });
  const next: CleanRules = {
    protectedNames: list(names),
    projectRoots: list(roots),
    nextIdleDays: Number(days.nextIdleDays),
    logAgeDays: Number(days.logAgeDays),
    staleNodeModulesDays: Number(days.staleNodeModulesDays),
  };
  const dirty = JSON.stringify(next) !== JSON.stringify(rules);
  // A render function, not a component: a component declared in here would be
  // a new type every render and the input would lose focus on each keystroke.
  const day = (k: keyof typeof days, label: string) => (
    <label key={k} className={rowCls}>
      <span className={`${copyCls} text-sm text-fg`}>{label}</span>
      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        <Input
          size="sm"
          mono
          inputMode="numeric"
          aria-label={label}
          value={days[k]}
          onChange={(e) => setDays((d) => ({ ...d, [k]: e.target.value.replace(/\D/g, '') }))}
          className="w-20 text-right tabular-nums"
        />
        days
      </span>
    </label>
  );
  return (
    <div className="divide-y divide-hairline">
      <label htmlFor="maclean-protected" className="flex flex-col gap-1.5 py-3.5">
        <span className="text-sm font-medium text-fg">Never touch paths containing</span>
        <Input
          id="maclean-protected"
          size="sm"
          aria-label="Protected names"
          value={names}
          onChange={(e) => setNames(e.target.value)}
        />
        <span className="block text-xs text-fg-muted">
          Comma-separated folder names, e.g. Fameo, ClientX.
        </span>
      </label>
      <label htmlFor="maclean-roots" className="flex flex-col gap-1.5 py-3.5">
        <span className="text-sm font-medium text-fg">Project folders</span>
        <Input
          id="maclean-roots"
          size="sm"
          mono
          aria-label="Project folders"
          value={roots}
          onChange={(e) => setRoots(e.target.value)}
        />
        <span className="block text-xs text-fg-muted">
          Where idle .next builds and old node_modules are looked for.
        </span>
      </label>
      {day('nextIdleDays', 'A .next build is idle after')}
      {day('logAgeDays', 'Remove app logs older than')}
      {day('staleNodeModulesDays', 'Report node_modules untouched for')}
      <div className="space-y-2 pt-3.5">
        {save.isError && <ErrorPanel error={save.error} fallback="Couldn't save" />}
        <div className="flex justify-end">
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate(next)}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
};

const AUTO_OPTIONS = [
  { value: '0', label: 'Off' },
  { value: '7', label: 'Weekly' },
  { value: '14', label: '2 weeks' },
  { value: '30', label: 'Monthly' },
];
const LOW_DISK_OPTIONS = [
  { value: '0', label: 'Off' },
  { value: '5', label: '5 GB' },
  { value: '10', label: '10 GB' },
  { value: '20', label: '20 GB' },
];

/** Tray automation: stored in settings.json, read by Rust every tick. */
const Automation = () => {
  const dispatch = useAppDispatch();
  const days = useAppSelector((s) => s.settings.macleanAutoCleanDays);
  const gb = useAppSelector((s) => s.settings.macleanLowDiskGb);
  return (
    <div className="divide-y divide-hairline">
      <div className={rowCls}>
        <div className={copyCls}>
          <p className="text-sm font-medium text-fg">Scheduled cleanup</p>
          <p className="text-xs text-fg-muted">
            From the menu bar: the default items only (never unused Docker images), skipping
            anything in use, then a notification with what it freed. The first run starts within
            minutes.
          </p>
        </div>
        <SegmentedControl
          ariaLabel="Scheduled cleanup"
          value={String(days)}
          options={AUTO_OPTIONS}
          onChange={(v) => dispatch(setMacleanAutoCleanDays(Number(v)))}
        />
      </div>
      <div className={rowCls}>
        <div className={copyCls}>
          <p className="text-sm font-medium text-fg">Low-disk warning</p>
          <p className="text-xs text-fg-muted">
            One notification when free space drops below this, not one every few minutes.
          </p>
        </div>
        <SegmentedControl
          ariaLabel="Low-disk warning"
          value={String(gb)}
          options={LOW_DISK_OPTIONS}
          onChange={(v) => dispatch(setMacleanLowDiskGb(Number(v)))}
        />
      </div>
    </div>
  );
};

export const MacCleanSettingsCard = () => {
  const rules = useCleanRules();
  return (
    <section className="rounded-xl p-6 text-card-foreground shadow-edge glass">
      <h2 className="font-display text-base font-semibold text-fg">Mac Clean</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        The same rules as mac-clean.sh. Checked again in Rust on every clean.
      </p>
      <p className="sr-caption mt-5">Automation</p>
      <Automation />
      <p className="sr-caption mt-5 border-t border-hairline pt-5">Cleanup rules</p>
      {rules.data ? (
        <Form rules={rules.data} />
      ) : (
        <div aria-hidden className="mt-3 h-40 animate-pulse rounded bg-list" />
      )}
    </section>
  );
};
