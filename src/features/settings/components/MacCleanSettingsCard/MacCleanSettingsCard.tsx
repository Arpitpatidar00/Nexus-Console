import { useState } from 'react';
import { Button } from '@/shared/ui/Button';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
// Deep imports: the maclean barrel would chain StoragePage into Settings' chunk.
import { useCleanRules, useSetCleanRules } from '@/features/maclean/api/macleanMutations';
import type { CleanRules } from '@/features/maclean/api/maclean.schema';

const inputCls =
  'h-8 rounded-md border border-border bg-paper px-2.5 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

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
    <label key={k} className="flex items-center justify-between gap-4 py-2.5 text-sm">
      <span className="text-fg">{label}</span>
      <span className="flex items-center gap-1.5 text-xs text-fg-muted">
        <input
          inputMode="numeric"
          aria-label={label}
          value={days[k]}
          onChange={(e) => setDays((d) => ({ ...d, [k]: e.target.value }))}
          className={`${inputCls} w-16 text-right tabular-nums`}
        />
        days
      </span>
    </label>
  );
  return (
    <div className="mt-2 divide-y divide-border">
      <label className="block space-y-1 py-3">
        <span className="text-sm font-medium text-fg">Never touch paths containing</span>
        <input
          aria-label="Protected names"
          value={names}
          onChange={(e) => setNames(e.target.value)}
          className={`${inputCls} w-full`}
        />
        <span className="block text-xs text-fg-muted">
          Comma-separated folder names, e.g. Fameo, ClientX.
        </span>
      </label>
      <label className="block space-y-1 py-3">
        <span className="text-sm font-medium text-fg">Project folders</span>
        <input
          aria-label="Project folders"
          value={roots}
          onChange={(e) => setRoots(e.target.value)}
          className={`${inputCls} w-full`}
        />
        <span className="block text-xs text-fg-muted">
          Where idle .next builds and old node_modules are looked for.
        </span>
      </label>
      {day('nextIdleDays', 'A .next build is idle after')}
      {day('logAgeDays', 'Remove app logs older than')}
      {day('staleNodeModulesDays', 'Report node_modules untouched for')}
      <div className="space-y-2 pt-3">
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

export const MacCleanSettingsCard = () => {
  const rules = useCleanRules();
  return (
    <section className="rounded-xl border border-border bg-paper p-5">
      <h2 className="text-base font-semibold text-fg">Mac Clean</h2>
      <p className="mt-1 text-xs text-fg-muted">
        The same rules as mac-clean.sh. Checked again in Rust on every clean.
      </p>
      {rules.data ? (
        <Form rules={rules.data} />
      ) : (
        <div aria-hidden className="mt-4 h-40 animate-pulse rounded bg-list" />
      )}
    </section>
  );
};
