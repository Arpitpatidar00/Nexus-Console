import type {
  CleanItem,
  DuplicateFile,
  DuplicateGroup,
} from '@/features/maclean/api/maclean.schema';
import type { AppDataReport, ProjectsReport } from '@/features/maclean/api/storageTools.schema';
import { canDelete } from './storageTools';

// One-click selections. Each returns the full set to select; deletion rules
// still live in Rust (a duplicate group always keeps a copy, protected
// projects and open apps are refused), so a shortcut can't select past them.

// --- Duplicates ----------------------------------------------------------------

export type KeepStrategy = 'smart' | 'newest' | 'oldest' | 'outsideDownloads';

/** `report (1).pdf`, `report copy.pdf`, `report copy 2.pdf`, `report-1.pdf`. */
const COPY_NAME = /(?:\s\(\d+\)|\scopy(?:\s\d+)?|-\d)(?=\.[^.]+$|$)/i;
export const looksLikeCopy = (path: string) => COPY_NAME.test(path.split('/').pop() ?? path);
const inDownloads = (path: string) => /\/Downloads\//.test(path);

/** Which copy to keep, per strategy. Smart: outside Downloads, then a name
 * that isn't a "(1)"/"copy" name, then the shortest path, then the oldest. */
export function keeperOf(files: DuplicateFile[], how: KeepStrategy): DuplicateFile {
  const byTime = (sign: 1 | -1) => (a: DuplicateFile, b: DuplicateFile) =>
    sign * (a.modifiedAt - b.modifiedAt);
  const sorted = [...files];
  if (how === 'newest') return sorted.sort(byTime(-1))[0];
  if (how === 'oldest') return sorted.sort(byTime(1))[0];
  const rank = (f: DuplicateFile) => [
    inDownloads(f.path) ? 1 : 0,
    how === 'smart' && looksLikeCopy(f.path) ? 1 : 0,
    how === 'smart' ? f.path.length : 0,
    f.modifiedAt,
  ];
  return sorted.sort((a, b) => {
    const x = rank(a);
    const y = rank(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return a.path.localeCompare(b.path);
  })[0];
}

/** Every copy except the keeper, in every group. */
export function duplicateSelection(groups: DuplicateGroup[], how: KeepStrategy): Set<string> {
  const out = new Set<string>();
  for (const g of groups) {
    const keep = keeperOf(g.files, how).path;
    for (const f of g.files) if (f.path !== keep) out.add(f.path);
  }
  return out;
}

/** Only the copies sitting in Downloads — and never a group's last copy. */
export function downloadsCopies(groups: DuplicateGroup[]): Set<string> {
  const out = new Set<string>();
  for (const g of groups) {
    const dl = g.files.filter((f) => inDownloads(f.path));
    const pick = dl.length === g.files.length ? dl.slice(1) : dl;
    for (const f of pick) out.add(f.path);
  }
  return out;
}

export const duplicateBytes = (groups: DuplicateGroup[], selected: ReadonlySet<string>) =>
  groups.reduce((n, g) => n + g.files.filter((f) => selected.has(f.path)).length * g.sizeBytes, 0);

// --- Projects --------------------------------------------------------------------

/** Folders that take a download to restore; everything else is quick build output. */
export const DEPENDENCY_DIRS = new Set(['node_modules', '.venv', 'venv', 'Pods', '.dart_tool']);

export function artifactSelection(
  r: ProjectsReport,
  which: 'dependencies' | 'buildOutput' | 'everything',
): Set<string> {
  return new Set(
    r.projects
      .filter(canDelete)
      .flatMap((p) => p.artifacts)
      .filter((a) => !a.blocked)
      .filter((a) =>
        which === 'everything'
          ? true
          : which === 'dependencies'
            ? DEPENDENCY_DIRS.has(a.name)
            : !DEPENDENCY_DIRS.has(a.name),
      )
      .map((a) => a.path),
  );
}

// --- Apps & AI ---------------------------------------------------------------------

export function appDataSelection(r: AppDataReport, which: 'caches' | 'backups'): Set<string> {
  return new Set(
    which === 'caches'
      ? r.spots.filter((s) => s.kind === 'cache' && !s.running).map((s) => s.id)
      : r.spots
          .filter((s) => s.kind === 'agentBackup')
          .flatMap((s) => s.children.map((c) => c.path)),
  );
}

// --- Cleanup plan -------------------------------------------------------------------

export const cleanableIds = (items: CleanItem[]) =>
  new Set(items.filter((i) => !i.skip && i.bytes > 0).map((i) => i.id));
