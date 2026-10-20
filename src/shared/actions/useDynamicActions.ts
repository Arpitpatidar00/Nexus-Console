import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useReconciledServices } from '@/shared/brew';
import { useStartService, useStopService, useRestartService } from '@/shared/brew/mutations';
import { usePorts } from '@/features/ports/api/usePorts';
import { useKillProcess } from '@/features/ports/api/useKillProcess';
import { useRemoteState } from '@/features/remote/api/useRemoteState';
import { useRemoteStatus } from '@/features/remote/api/useRemoteStatus';
import { remoteKeys } from '@/features/remote/api/keys';
import { connectionSchema } from '@/features/remote/api/remote.schema';
import { openTerminal } from '@/shared/state/terminalsSlice';
import { setActiveTab } from '@/shared/state/uiSlice';
import { ipc, ipcVoid, CMD } from '@/shared/tauri';
import type { ActionItem } from './types';

export function useDynamicActions(): ActionItem[] {
  const qc = useQueryClient();
  const { services } = useReconciledServices();
  const startService = useStartService();
  const stopService = useStopService();
  const restartService = useRestartService();

  const portsQuery = usePorts(true);
  const killProcess = useKillProcess();

  const remoteState = useRemoteState();
  const remoteStatus = useRemoteStatus();

  const hosts = useMemo(() => remoteState.data?.hosts ?? [], [remoteState.data?.hosts]);

  return useMemo(() => {
    const actions: ActionItem[] = [];

    // 1. Service actions
    for (const svc of services) {
      const isRunning = svc.status === 'running';
      const isLinked = svc.linkState === 'linked';

      if (isRunning) {
        actions.push({
          id: `svc:stop:${svc.formula}`,
          title: `Stop service: ${svc.displayName || svc.formula}`,
          subtitle: `Running${svc.port ? ` on port ${svc.port}` : ''}`,
          keywords: ['service', 'stop', svc.formula, svc.displayName || ''],
          group: 'services',
          run: () => {
            stopService.mutate({ name: svc.formula });
          },
        });
        actions.push({
          id: `svc:restart:${svc.formula}`,
          title: `Restart service: ${svc.displayName || svc.formula}`,
          keywords: ['service', 'restart', 'reload', svc.formula],
          group: 'services',
          run: () => {
            restartService.mutate({ name: svc.formula, linked: isLinked });
          },
        });
      } else {
        actions.push({
          id: `svc:start:${svc.formula}`,
          title: `Start service: ${svc.displayName || svc.formula}`,
          subtitle: 'Stopped',
          keywords: ['service', 'start', 'run', svc.formula, svc.displayName || ''],
          group: 'services',
          run: () => {
            startService.mutate({ name: svc.formula, linked: isLinked });
          },
        });
      }
    }

    // 2. Ports actions
    const ports = portsQuery.data ?? [];
    for (const p of ports) {
      actions.push({
        id: `port:kill:${p.pid}:${p.port}`,
        title: `Kill process on port ${p.port}`,
        subtitle: `${p.command} (PID ${p.pid})${p.project ? ` · ${p.project}` : ''}`,
        keywords: ['port', 'kill', String(p.port), p.command, p.project || ''],
        group: 'ports',
        danger: true,
        run: ({ dispatch, navigate }) => {
          dispatch(setActiveTab('ports'));
          navigate('ports');
          killProcess.mutate({ pid: p.pid, force: false, sudo: false });
        },
      });
    }

    // 3. Remote servers actions
    for (const h of hosts) {
      const isConnected = !!remoteStatus.data?.get(h.id);
      if (isConnected) {
        actions.push({
          id: `remote:shell:${h.id}`,
          title: `Terminal: ${h.label}`,
          subtitle: `Connected (${h.env})`,
          keywords: ['server', 'remote', 'shell', 'terminal', h.label, h.project],
          group: 'remote',
          run: ({ dispatch }) => {
            dispatch(
              openTerminal({
                target: { type: 'remoteShell', hostId: h.id },
                title: `${h.label} · ssh`,
              }),
            );
          },
        });
        actions.push({
          id: `remote:disconnect:${h.id}`,
          title: `Disconnect: ${h.label}`,
          subtitle: `Active master connection (${h.env})`,
          keywords: ['server', 'disconnect', 'close', h.label],
          group: 'remote',
          run: async () => {
            await ipcVoid(CMD.REMOTE_DISCONNECT, { id: h.id });
            qc.removeQueries({ queryKey: remoteKeys.snapshot(h.id) });
            qc.setQueryData<{ id: string; connected: boolean }[]>(remoteKeys.status(), (rows) =>
              (rows ?? []).map((r) => (r.id === h.id ? { ...r, connected: false } : r)),
            );
            void qc.invalidateQueries({ queryKey: remoteKeys.status() });
          },
        });
      } else {
        actions.push({
          id: `remote:connect:${h.id}`,
          title: `Connect: ${h.label}`,
          subtitle: `${h.env} · ${h.project}`,
          keywords: ['server', 'connect', 'ssh', h.label, h.project],
          group: 'remote',
          run: async () => {
            await ipc(CMD.REMOTE_CONNECT, { id: h.id }, connectionSchema);
            qc.setQueryData<{ id: string; connected: boolean }[]>(remoteKeys.status(), (rows) => [
              ...(rows ?? []).filter((r) => r.id !== h.id),
              { id: h.id, connected: true },
            ]);
            void qc.invalidateQueries({ queryKey: remoteKeys.status() });
          },
        });
      }
    }

    return actions;
  }, [
    qc,
    services,
    startService,
    stopService,
    restartService,
    portsQuery.data,
    killProcess,
    hosts,
    remoteStatus.data,
  ]);
}
