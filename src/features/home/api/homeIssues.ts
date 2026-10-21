import type { Tab } from '@/shared/state/uiSlice';
import { formatBytes } from '@/shared/lib/format';

export interface HomeIssue {
  id: string;
  severity: 'red' | 'yellow';
  title: string;
  detail: string;
  /** Where the fix lives. */
  tab: Tab;
}

export interface HomeInputs {
  services?: { name: string; status: string; healthy: boolean | null; port: number | null }[];
  disk?: { freeBytes: number; totalBytes: number } | null;
  memory?: { pressure: 'normal' | 'warning' | 'critical' | 'unknown' } | null;
  monitors?: {
    id: string;
    name: string;
    url: string;
    enabled: boolean;
    isUp: boolean;
    history: unknown[];
  }[];
  ports?: { pid: number; command: string; port: number; detached: boolean }[];
  serverFindings?: {
    hostId: string;
    host: string;
    id: string;
    severity: string;
    summary: string;
  }[];
}

const GB = 1024 ** 3;
/** Low disk: under 10 GB, or under 5% of the volume, whichever is larger. */
export const lowDiskThreshold = (totalBytes: number) => Math.max(10 * GB, totalBytes * 0.05);

/** Only measured problems (PLAN F.2): every issue comes from data a module
 * already read, and points at the page that can fix it. Red first. */
export function collectIssues(i: HomeInputs): HomeIssue[] {
  const out: HomeIssue[] = [];

  for (const s of i.services ?? []) {
    if (s.status === 'error') {
      out.push({
        id: `svc:${s.name}`,
        severity: 'red',
        title: `${s.name} failed to start`,
        detail: 'Homebrew reports the service in an error state.',
        tab: 'services',
      });
    } else if (s.status === 'started' && s.healthy === false) {
      out.push({
        id: `svc:${s.name}`,
        severity: 'yellow',
        title: `${s.name} is running but not answering`,
        detail: s.port ? `Nothing responds on port ${s.port}.` : 'Its health check fails.',
        tab: 'services',
      });
    }
  }

  if (i.disk && i.disk.freeBytes < lowDiskThreshold(i.disk.totalBytes)) {
    out.push({
      id: 'disk',
      severity: i.disk.freeBytes < 5 * GB ? 'red' : 'yellow',
      title: `Only ${formatBytes(i.disk.freeBytes)} free on Macintosh HD`,
      detail: 'Storage shows what is safe to clean.',
      tab: 'storage',
    });
  }

  if (i.memory?.pressure === 'critical' || i.memory?.pressure === 'warning') {
    out.push({
      id: 'memory',
      severity: i.memory.pressure === 'critical' ? 'red' : 'yellow',
      title: `Memory pressure is ${i.memory.pressure}`,
      detail: 'macOS is compressing or swapping memory.',
      tab: 'memory',
    });
  }

  for (const m of i.monitors ?? []) {
    if (m.enabled && !m.isUp && m.history.length > 0) {
      out.push({
        id: `uptime:${m.id}`,
        severity: 'red',
        title: `${m.name} is down`,
        detail: m.url,
        tab: 'domains',
      });
    }
  }

  for (const p of i.ports ?? []) {
    if (p.detached) {
      out.push({
        id: `port:${p.pid}:${p.port}`,
        severity: 'yellow',
        title: `${p.command} is still listening on :${p.port}`,
        detail: 'Its terminal or parent process is gone.',
        tab: 'ports',
      });
    }
  }

  for (const f of i.serverFindings ?? []) {
    if (f.severity === 'red') {
      out.push({
        id: `server:${f.hostId}:${f.id}`,
        severity: 'red',
        title: `${f.host}: ${f.summary}`,
        detail: 'From the last check of this server.',
        tab: 'servers',
      });
    }
  }

  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'red' ? -1 : 1));
}
