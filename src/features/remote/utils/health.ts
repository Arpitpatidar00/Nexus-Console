import type { HostSnapshot } from '@/features/remote/api/remote.schema';

export type HostHealth = 'ok' | 'warn' | 'critical' | 'unknown';

/** One status per host for the list: the worst finding wins. Info-only
 * (green) findings never turn a host yellow. No snapshot yet → unknown. */
export function healthOf(snapshot: HostSnapshot | undefined): HostHealth {
  if (!snapshot) return 'unknown';
  if (snapshot.findings.some((f) => f.severity === 'red')) return 'critical';
  if (snapshot.findings.some((f) => f.severity === 'yellow')) return 'warn';
  return 'ok';
}

/** Findings worth a count badge: red + yellow. */
export function issueCount(snapshot: HostSnapshot | undefined): number {
  return snapshot?.findings.filter((f) => f.severity !== 'green').length ?? 0;
}

/** Used share the way `df` reports it: reserved blocks don't count. */
export function usedPct(used: number, avail: number): number {
  return used + avail === 0 ? 0 : (used * 100) / (used + avail);
}
