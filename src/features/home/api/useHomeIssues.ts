import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, CMD } from '@/shared/tauri';
import { brewKeys, servicesSchema } from '@/shared/brew';
import { useEnabledModules } from '@/shared/modules';
import { useAppSelector } from '@/shared/state/hooks';
// Deep imports: the feature barrels would chain whole pages into Home's chunk.
import { portsSchema } from '@/features/ports/api/ports.schema';
import { uptimeMonitorSchema } from '@/features/domains/api/domains.schema';
import { memorySchema } from '@/features/maclean/api/maclean.schema';
import type { RemoteState, HostSnapshot } from '@/features/remote/api/remote.schema';
import { collectIssues } from './homeIssues';

const diskSchema = z.object({ freeBytes: z.number(), totalBytes: z.number() }).nullable();
const POLL_MS = 30_000;

/** Home reads only while it is on screen, only for enabled modules, and never
 * connects anywhere: server issues come from snapshots already fetched. */
export function useHomeIssues() {
  const onHome = useAppSelector((s) => s.ui.activeTab === 'home');
  const enabled = useEnabledModules();
  const qc = useQueryClient();
  const live = (id: Parameters<typeof enabled.includes>[0]) => onHome && enabled.includes(id);
  const poll = {
    refetchInterval: onHome ? POLL_MS : false,
    refetchIntervalInBackground: false,
    meta: { silent: true },
  } as const;

  const services = useQuery({
    queryKey: brewKeys.services(),
    queryFn: () => ipc(CMD.LIST_SERVICES, { withStats: true }, servicesSchema),
    enabled: live('homebrew'),
  });
  const disk = useQuery({
    queryKey: ['home', 'disk'],
    queryFn: () => ipc(CMD.SYSTEM_DISK_FREE, undefined, diskSchema),
    enabled: onHome,
    ...poll,
  });
  const memory = useQuery({
    queryKey: ['maclean', 'memory'],
    queryFn: () => ipc(CMD.MACLEAN_MEMORY, undefined, memorySchema),
    enabled: live('maclean'),
    ...poll,
  });
  const monitors = useQuery({
    queryKey: ['domains', 'uptime'],
    queryFn: () => ipc(CMD.UPTIME_LIST_MONITORS, undefined, z.array(uptimeMonitorSchema)),
    enabled: live('domains'),
    ...poll,
  });
  const ports = useQuery({
    queryKey: ['ports', true],
    queryFn: () => ipc(CMD.LIST_PORTS, { listeningOnly: true }, portsSchema),
    enabled: live('ports'),
    ...poll,
  });

  const remoteOn = enabled.includes('remote');
  const hosts = remoteOn ? (qc.getQueryData<RemoteState>(['remote', 'state'])?.hosts ?? []) : [];
  const serverFindings = hosts.flatMap((h) => {
    const snap = qc.getQueryData<HostSnapshot>(['remote', 'snapshot', h.id]);
    return (snap?.findings ?? []).map((f) => ({ ...f, hostId: h.id, host: h.label }));
  });

  const issues = collectIssues({
    services: enabled.includes('homebrew') ? services.data : undefined,
    disk: disk.data,
    memory: enabled.includes('maclean') ? memory.data : undefined,
    monitors: enabled.includes('domains') ? monitors.data : undefined,
    ports: enabled.includes('ports') ? ports.data : undefined,
    serverFindings,
  });

  const isLoading = [services, disk, memory, monitors, ports].some((q) => q.isLoading);
  return {
    issues,
    isLoading,
    checkedServers: hosts.filter((h) => qc.getQueryData(['remote', 'snapshot', h.id])).length,
  };
}
