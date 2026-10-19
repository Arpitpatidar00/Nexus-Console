import type { HostEnv, RemoteHost } from '@/features/remote/api/remote.schema';

/** Prod sorts last inside a project, so the risky hosts are never the default
 * selection and never the row under a stray click at the top of a group. */
const ENV_RANK: Record<HostEnv, number> = { dev: 0, staging: 1, other: 2, prod: 3 };

export const UNGROUPED = 'Ungrouped';

export interface HostGroup {
  project: string;
  hosts: RemoteHost[];
}

/** Project → hosts, projects A–Z with "Ungrouped" last; hosts by env (prod
 * last), then the user's order, then label. */
export function groupHosts(hosts: RemoteHost[]): HostGroup[] {
  const byProject = new Map<string, RemoteHost[]>();
  for (const h of hosts) {
    const list = byProject.get(h.project) ?? [];
    list.push(h);
    byProject.set(h.project, list);
  }
  return [...byProject.entries()]
    .sort(([a], [b]) => {
      if (a === UNGROUPED) return 1;
      if (b === UNGROUPED) return -1;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    })
    .map(([project, list]) => ({
      project,
      hosts: [...list].sort(
        (a, b) =>
          ENV_RANK[a.env] - ENV_RANK[b.env] || a.order - b.order || a.label.localeCompare(b.label),
      ),
    }));
}

/** Every project name in use, for the project field's suggestions. */
export function projectNames(hosts: RemoteHost[]): string[] {
  return [...new Set(hosts.map((h) => h.project))]
    .filter((p) => p !== UNGROUPED)
    .sort((a, b) => a.localeCompare(b));
}
