import type {
  AppDataReport,
  Project,
  ProjectsReport,
} from '@/features/maclean/api/storageTools.schema';

const DAY = 86_400;

/** Whole days since `epoch` (seconds). */
export const idleDays = (epoch: number, nowSecs: number) =>
  Math.max(0, Math.floor((nowSecs - epoch) / DAY));

/** "today", "yesterday", "12 days ago", "3 months ago". */
export function idleLabel(epoch: number, nowSecs: number): string {
  const d = idleDays(epoch, nowSecs);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 45) return `${d} days ago`;
  if (d < 365) return `${Math.round(d / 30)} months ago`;
  return `${Math.round(d / 365)} year${d < 730 ? '' : 's'} ago`;
}

export const canDelete = (p: Project) => p.protectedBy == null;

/** Every deletable artifact path of projects untouched for `days` or more. */
export function idleSelection(r: ProjectsReport, days: number, nowSecs: number): Set<string> {
  return new Set(
    r.projects
      .filter((p) => canDelete(p) && idleDays(p.lastActiveEpoch, nowSecs) >= days)
      .flatMap((p) => p.artifacts.filter((a) => !a.blocked).map((a) => a.path)),
  );
}

export function selectedBytes(r: ProjectsReport, selected: ReadonlySet<string>): number {
  return r.projects
    .flatMap((p) => p.artifacts)
    .reduce((s, a) => s + (selected.has(a.path) ? a.bytes : 0), 0);
}

/** Deletable bytes per "idle at least N days" bucket, for the quick picks. */
export function idleBuckets(r: ProjectsReport, nowSecs: number, days: number[]) {
  return days.map((d) => ({ days: d, bytes: selectedBytes(r, idleSelection(r, d, nowSecs)) }));
}

/** A project's checkbox: all its deletable artifacts selected, some, or none. */
export function projectState(p: Project, selected: ReadonlySet<string>): 'all' | 'some' | 'none' {
  const paths = p.artifacts.filter((a) => !a.blocked).map((a) => a.path);
  const n = paths.filter((x) => selected.has(x)).length;
  return n === 0 ? 'none' : n === paths.length ? 'all' : 'some';
}

/** Apps & AI: a target is a cache spot id or an agent-backup path. */
export function appDataSelectedBytes(r: AppDataReport, targets: ReadonlySet<string>): number {
  let total = 0;
  for (const s of r.spots) {
    if (targets.has(s.id)) total += s.bytes;
    for (const c of s.children) if (targets.has(c.path)) total += c.bytes;
  }
  return total;
}
