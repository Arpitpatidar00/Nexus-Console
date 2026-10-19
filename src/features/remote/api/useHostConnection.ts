import { IpcError } from '@/shared/tauri';
import { useRemoteStatus } from './useRemoteStatus';
import { useLastConnect } from './remoteMutations';
import { useCachedSnapshot } from './useHostSnapshot';

export type ConnectionState = 'notConnected' | 'connecting' | 'connected' | 'error';

/** SSH failures the host shows inline, with a kind-specific next step. */
export const SSH_KINDS = ['auth', 'hostKey', 'unreachable', 'timeout'] as const;

const isSshError = (e: unknown): e is IpcError =>
  e instanceof IpcError && (SSH_KINDS as readonly string[]).includes(e.kind);

/** One answer to "what's this host doing?", combining the master check, the
 * last connect attempt and the last snapshot. A failed probe on a host whose
 * master is still up (`busy`, or a parse error) doesn't flip it to error. */
export function useHostConnection(id: string): { state: ConnectionState; error: IpcError | null } {
  const status = useRemoteStatus();
  const connect = useLastConnect(id);
  const snap = useCachedSnapshot(id);
  const connected = status.data?.get(id) ?? false;

  if (connect.pending) return { state: 'connecting', error: null };
  const snapErr = isSshError(snap.error) ? snap.error : null;
  if (connected && !snapErr) return { state: 'connected', error: null };
  const error = snapErr ?? connect.error;
  if (error && error.kind !== 'cancelled') return { state: 'error', error };
  return { state: 'notConnected', error: null };
}
