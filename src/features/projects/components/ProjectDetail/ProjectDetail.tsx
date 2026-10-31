import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  FolderOpen,
  Play,
  RotateCw,
  Square,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/cn';
import { useAppDispatch, useAppSelector } from '@/shared/state/hooks';
import { openTerminal, terminalKey } from '@/shared/state/terminalsSlice';
import type { PtyTarget } from '@/shared/tauri/pty';
import { Button } from '@/shared/ui/Button';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Skeleton } from '@/shared/ui/Skeleton';
import type { DiscoveredProject } from '@/features/projects/api/projects.schema';
import type { Check, Task } from '@/features/projects/api/runner.schema';
import {
  openLocalUrl,
  useCreateEnv,
  useOpenProjectIn,
  useProjectProfile,
  useStopProjectProcess,
} from '@/features/projects/api/useRunner';
import { ProjectCard } from '@/features/projects/components/ProjectCard';
import {
  commandText,
  groupTasks,
  needsInstall,
  runPlan,
  sortChecks,
} from '@/features/projects/utils/runner';

const Section = ({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) => (
  <section className="border-b border-hairline px-6 py-4 last:border-b-0">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {aside}
    </div>
    {children}
  </section>
);

const LEVEL_ICON = {
  ok: <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="OK" />,
  warn: <AlertTriangle className="size-4 shrink-0 text-warning" aria-label="Warning" />,
  error: <XCircle className="size-4 shrink-0 text-destructive" aria-label="Problem" />,
};

const copy = (text: string) => {
  void navigator.clipboard.writeText(text);
  toast.success('Copied', { description: text });
};

interface Props {
  project: DiscoveredProject;
  onOpenWorkspace: (p: DiscoveredProject) => void;
  onOpenCommands: (p: DiscoveredProject) => void;
}

/** One project, ready to run: pick a task, see exactly what will run, fix
 * what's missing first. Every task runs in the terminal drawer, in the
 * project folder, resolved by Rust from the project's own config. */
export const ProjectDetail = ({ project, onOpenWorkspace, onOpenCommands }: Props) => {
  const dispatch = useAppDispatch();
  const sessions = useAppSelector((s) => s.terminals.sessions);
  const cap = useAppSelector((s) => s.terminals.cap);
  // Poll for a couple of minutes after a run starts, and while anything runs.
  // Each run bumps `runs`; the effect ends that run's 2-minute polling window.
  const [runs, setRuns] = useState(0);
  const [recent, setRecent] = useState(false);
  useEffect(() => {
    if (!runs) return;
    const t = setTimeout(() => setRecent(false), 120_000);
    return () => clearTimeout(t);
  }, [runs]);
  const q = useProjectProfile(project.path, recent);
  const p = q.data;
  const createEnv = useCreateEnv(project.path);
  const stop = useStopProjectProcess(project.path);
  const openIn = useOpenProjectIn(project.path);
  const [chosen, setChosen] = useState<string | null>(null);
  const [installFirst, setInstallFirst] = useState(true);

  const run = (task: Task, withInstall: boolean) => {
    const target: PtyTarget = {
      type: 'projectTask',
      projectPath: project.path,
      taskId: task.id,
      installFirst: withInstall,
    };
    const open = sessions.some((s) => s.key === terminalKey(target));
    if (!open && sessions.length >= cap) {
      toast.error(`All ${cap} terminal tabs are in use`, {
        description: 'Close one in the terminal drawer to run this.',
      });
      return;
    }
    if (open)
      toast.info(`${task.label} is already open in the terminal`, {
        description: 'Showing its tab.',
      });
    dispatch(openTerminal({ target, title: `${project.name} · ${task.label}` }));
    setRecent(true);
    setRuns((n) => n + 1);
  };

  const fix = (c: Check) => {
    if (!c.fix || !p) return null;
    const f = c.fix;
    if (f.kind === 'runTask') {
      const t = p.tasks.find((x) => x.id === f.taskId);
      return t ? (
        <Button size="sm" variant="outline" onClick={() => run(t, false)}>
          <Play />
          {t.label}
        </Button>
      ) : null;
    }
    if (f.kind === 'createEnv') {
      return (
        <Button
          size="sm"
          variant="outline"
          disabled={createEnv.isPending}
          onClick={() => createEnv.mutate()}
        >
          Create .env from {f.from}
        </Button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => copy(f.text)}
        title="Copy"
        className="flex max-w-full cursor-pointer items-center gap-1.5 rounded-md border border-hairline px-2 py-1 font-mono text-xs text-fg hover:bg-accent"
      >
        <Copy className="size-3 shrink-0" aria-hidden />
        <span className="truncate">{f.text}</span>
      </button>
    );
  };

  const header = (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-hairline px-6 py-3.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-base font-semibold text-fg">{project.name}</h2>
          {(p?.frameworks.length ? p.frameworks : [project.framework]).map((f) => (
            <span key={f} className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground">
              {f}
            </span>
          ))}
          {p?.packageManager && (
            <span className="text-[11px] text-muted-foreground">{p.packageManager}</span>
          )}
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground" title={project.path}>
          {project.path}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openIn.mutate('vscode')}
          title="Open in VS Code"
        >
          <Code2 />
          VS Code
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          onClick={() => openIn.mutate('finder')}
          aria-label="Show in Finder"
          title="Show in Finder"
        >
          <FolderOpen />
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          aria-label="Recheck"
          title="Recheck"
          disabled={q.isFetching}
          onClick={() => void q.refetch()}
        >
          <RotateCw className={cn(q.isFetching && 'animate-spin motion-reduce:animate-none')} />
        </Button>
      </div>
    </header>
  );

  if (q.error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="p-6">
          <ErrorPanel
            error={q.error}
            fallback="Couldn't read this project"
            onRetry={() => void q.refetch()}
          />
        </div>
      </div>
    );
  }
  if (!p) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <Skeleton lines={8} className="px-6 py-4" />
      </div>
    );
  }

  const runnable = p.tasks.filter((t) => t.kind !== 'install');
  const selectedId =
    chosen && p.tasks.some((t) => t.id === chosen)
      ? chosen
      : (p.primary ?? runnable[0]?.id ?? null);
  const selected = p.tasks.find((t) => t.id === selectedId) ?? null;
  const install = needsInstall(p) && selected?.kind !== 'install';
  const plan = selected ? runPlan(p, selected.id, install && installFirst) : [];
  const blocked = p.checks.some((c) => c.level === 'error');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Run */}
        <section className="border-b border-hairline px-6 py-4">
          {p.running.length > 0 && (
            <ul className="mb-3 space-y-1.5">
              {p.running.map((r) => (
                <li
                  key={`${r.pid}:${r.port}`}
                  className="flex flex-wrap items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm"
                >
                  <span className="size-2 rounded-full bg-success" aria-hidden />
                  <span className="text-fg">
                    Running on <span className="font-mono">localhost:{r.port}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.command} · pid {r.pid}
                  </span>
                  <span className="ml-auto flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void openLocalUrl(r.port).catch((e) => toast.error(String(e)))}
                    >
                      <ExternalLink />
                      Open
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={stop.isPending}
                      onClick={() => stop.mutate(r.pid)}
                    >
                      <Square />
                      Stop
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {runnable.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Stackroost couldn't find a way to run this project. It reads package.json scripts,
              Makefile targets, framework files (Django, FastAPI, Spring…) and build tools.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Task to run"
                value={selectedId ?? ''}
                onChange={(e) => setChosen(e.target.value)}
                className="h-9 min-w-48 cursor-pointer rounded-full border border-hairline bg-muted px-3 text-sm text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {groupTasks(runnable).map((g) => (
                  <optgroup key={g.title} label={g.title}>
                    {g.tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                        {t.id === p.primary ? ' (default)' : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <Button
                variant="ember"
                disabled={!selected}
                onClick={() => selected && run(selected, install && installFirst)}
              >
                <Play />
                {install && installFirst ? 'Install & run' : 'Run'}
              </Button>
              {install && (
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={installFirst}
                    onChange={(e) => setInstallFirst(e.target.checked)}
                    className="accent-ember"
                  />
                  Install dependencies first
                </label>
              )}
              {blocked && (
                <span className="text-xs text-destructive">
                  Fix the problems below first — it will likely fail.
                </span>
              )}
            </div>
          )}
          {plan.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              Runs in the terminal, in this folder:
              {plan.map((step, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <span aria-hidden>→</span>}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-fg">{step}</code>
                </span>
              ))}
              {p.expectedPort != null && p.running.length === 0 && (
                <span>· usually serves on :{p.expectedPort}</span>
              )}
            </p>
          )}
        </section>

        {/* Readiness */}
        <Section title="Ready to run?">
          <ul className="space-y-2">
            {sortChecks(p.checks).map((c) => (
              <li key={c.id} className="flex flex-wrap items-start gap-3">
                <span className="mt-0.5">{LEVEL_ICON[c.level]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg">{c.title}</p>
                  {c.detail && <p className="text-xs text-muted-foreground">{c.detail}</p>}
                </div>
                {fix(c)}
              </li>
            ))}
            {p.checks.length === 0 && (
              <li className="flex items-center gap-3 text-sm text-fg">
                {LEVEL_ICON.ok}
                Nothing to set up.
              </li>
            )}
          </ul>
          {!p.envRead && (p.hasEnv || p.envTemplate) && (
            <p className="mt-3 text-xs text-muted-foreground">
              To check .env against {p.envTemplate ?? 'its template'} (key names only, never
              values), allow “Project Environment Files” in Settings → Privacy.
            </p>
          )}
        </Section>

        {/* Tasks */}
        <Section
          title="Tasks"
          aside={<span className="text-xs text-muted-foreground">{p.tasks.length} found</span>}
        >
          <div className="space-y-4">
            {groupTasks(p.tasks).map((g) => (
              <div key={g.title}>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{g.title}</p>
                <ul className="divide-y divide-hairline rounded-lg border border-hairline">
                  {g.tasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-fg">{t.label}</span>
                          {t.id === p.primary && (
                            <span className="rounded bg-ember-soft px-1.5 text-[11px] text-ember-text">
                              default
                            </span>
                          )}
                          {t.longRunning && (
                            <span className="text-[11px] text-muted-foreground">keeps running</span>
                          )}
                          <span className="text-[11px] text-muted-foreground">· {t.source}</span>
                        </div>
                        <p
                          className="truncate font-mono text-xs text-muted-foreground"
                          title={commandText(t)}
                        >
                          {commandText(t)}
                        </p>
                      </div>
                      <Button
                        size="iconSm"
                        variant="ghost"
                        aria-label={`Run ${t.label}`}
                        title={`Run ${t.label}`}
                        onClick={() => run(t, false)}
                      >
                        <Play />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        {/* Tools */}
        {p.tools.length > 0 && (
          <Section title="Tools">
            <ul className="flex flex-wrap gap-2">
              {p.tools.map((t) => (
                <li
                  key={t.name}
                  title={t.found ? `Needed for ${t.neededFor}` : `Install: ${t.install}`}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                    t.found ? 'border-hairline text-fg' : 'border-destructive text-destructive',
                  )}
                >
                  {t.found ? (
                    <CheckCircle2 className="size-3.5 text-success" aria-hidden />
                  ) : (
                    <XCircle className="size-3.5" aria-hidden />
                  )}
                  {t.label}
                  <span className="text-muted-foreground tabular-nums">
                    {t.found ? t.version : 'not found'}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Git & workspace: the existing card, unchanged */}
        <Section title="Git & workspace">
          <ProjectCard
            project={project}
            onOpenWorkspace={onOpenWorkspace}
            onOpenCommands={onOpenCommands}
          />
        </Section>
      </div>
    </div>
  );
};
