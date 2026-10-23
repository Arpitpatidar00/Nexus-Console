import type { Check, ProjectProfile, Task, TaskKind } from '@/features/projects/api/runner.schema';

/** `pnpm run dev`, or `python3 -m venv .venv → .venv/bin/pip install -r requirements.txt`. */
export const commandText = (t: Pick<Task, 'steps'>) =>
  t.steps.map((s) => s.join(' ')).join('  →  ');

const GROUPS: { kinds: TaskKind[]; title: string }[] = [
  { kinds: ['dev', 'start'], title: 'Run' },
  { kinds: ['build'], title: 'Build' },
  { kinds: ['test'], title: 'Test' },
  { kinds: ['lint'], title: 'Check & format' },
  { kinds: ['install'], title: 'Dependencies' },
  { kinds: ['other'], title: 'Other' },
];

/** Tasks in the order people reach for them; empty groups dropped. */
export function groupTasks(tasks: Task[]): { title: string; tasks: Task[] }[] {
  return GROUPS.map((g) => ({
    title: g.title,
    tasks: tasks.filter((t) => g.kinds.includes(t.kind)),
  })).filter((g) => g.tasks.length > 0);
}

/** Whether Run should install first: dependencies missing or out of date. */
export const needsInstall = (p: ProjectProfile) =>
  (p.deps === 'missing' || p.deps === 'stale') && p.install != null;

/** What pressing Run will do, as steps the user can read before clicking. */
export function runPlan(p: ProjectProfile, taskId: string, installFirst: boolean): string[] {
  const t = p.tasks.find((x) => x.id === taskId);
  if (!t) return [];
  const install =
    installFirst && needsInstall(p)
      ? p.tasks.find((x) => x.id === p.install && x.id !== t.id)
      : undefined;
  return [...(install?.steps ?? []), ...t.steps].map((s) => s.join(' '));
}

/** Errors first, then warnings, then the good news. */
export const sortChecks = (checks: Check[]) =>
  [...checks].sort(
    (a, b) => ['error', 'warn', 'ok'].indexOf(a.level) - ['error', 'warn', 'ok'].indexOf(b.level),
  );

/** One word for the list: running, needs setup, blocked, or ready. */
export function readiness(p: ProjectProfile): 'running' | 'blocked' | 'setup' | 'ready' {
  if (p.running.length > 0) return 'running';
  if (p.checks.some((c) => c.level === 'error')) return 'blocked';
  if (p.checks.some((c) => c.level === 'warn')) return 'setup';
  return 'ready';
}
