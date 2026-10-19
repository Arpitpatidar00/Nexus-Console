import type { IpcErrorKind } from '@/shared/tauri';
import type { HostHealth } from '@/features/remote/utils/health';
import type { ConnectionState } from '@/features/remote/api/useHostConnection';

export type Tone = 'neutral' | 'pending' | 'ok' | 'warn' | 'danger';

export const DOT: Record<Tone, string> = {
  neutral: 'bg-stopped-dot',
  pending: 'bg-warn-dot animate-pulse motion-reduce:animate-none',
  ok: 'bg-running-dot',
  warn: 'bg-warn-dot',
  danger: 'bg-danger-dot',
};

export const ERROR_SHORT: Partial<Record<IpcErrorKind, string>> = {
  auth: 'Key not accepted',
  hostKey: 'Host key not trusted',
  unreachable: 'Unreachable',
  timeout: 'Timed out',
};

/** Status is always a dot AND words (never colour alone). */
export function describeStatus(
  state: ConnectionState,
  health: HostHealth,
  issues: number,
  errorKind: IpcErrorKind | undefined,
): { tone: Tone; label: string } {
  switch (state) {
    case 'notConnected':
      return { tone: 'neutral', label: 'Not connected' };
    case 'connecting':
      return { tone: 'pending', label: 'Connecting…' };
    case 'error':
      return { tone: 'danger', label: (errorKind && ERROR_SHORT[errorKind]) ?? "Can't connect" };
    case 'connected': {
      const n = `${issues} issue${issues === 1 ? '' : 's'}`;
      if (health === 'critical') return { tone: 'danger', label: n };
      if (health === 'warn') return { tone: 'warn', label: n };
      if (health === 'ok') return { tone: 'ok', label: 'Healthy' };
      return { tone: 'ok', label: 'Connected' };
    }
  }
}
