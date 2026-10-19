import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { ipc, ipcVoid, CMD, IpcError } from '@/shared/tauri';
import { remoteKeys } from './keys';
import { connectionSchema, hostSchema, type HostEnv } from './remote.schema';

export type DockerAction = 'start' | 'stop' | 'restart' | 'remove';

function useInvalidateState() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: remoteKeys.state() });
}

export function useSetConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (granted: boolean) => ipcVoid(CMD.REMOTE_SET_CONSENT, { granted }),
    meta: { quiet: true },
    onSettled: (_d, _e, granted) => {
      void qc.invalidateQueries({ queryKey: remoteKeys.state() });
      // Revoking closes every connection in Rust; drop what we showed for them.
      if (!granted) {
        qc.removeQueries({ queryKey: ['remote', 'snapshot'] });
        void qc.invalidateQueries({ queryKey: remoteKeys.status() });
      }
    },
  });
}

export interface ImportHostInput {
  alias: string;
  label?: string;
  project?: string;
  env: HostEnv;
}

export function useImportHosts() {
  const invalidate = useInvalidateState();
  return useMutation({
    mutationFn: (hosts: ImportHostInput[]) => ipcVoid(CMD.REMOTE_IMPORT_HOSTS, { hosts }),
    onSettled: invalidate,
    meta: { silent: true, quiet: true },
  });
}

export interface ManualHostInput {
  hostname: string;
  user: string;
  port: number;
  identityFile?: string;
  label?: string;
  project?: string;
  env: HostEnv;
}

export function useAddManualHost() {
  const invalidate = useInvalidateState();
  return useMutation({
    mutationFn: (input: ManualHostInput) => ipc(CMD.REMOTE_ADD_MANUAL_HOST, { input }, hostSchema),
    onSettled: invalidate,
    meta: { silent: true, quiet: true },
  });
}

export interface HostPatch {
  label?: string;
  project?: string;
  env?: HostEnv;
  order?: number;
}

export function useUpdateHost() {
  const invalidate = useInvalidateState();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: HostPatch }) =>
      ipcVoid(CMD.REMOTE_UPDATE_HOST, { id, patch }),
    onSettled: invalidate,
    meta: { silent: true, quiet: true },
  });
}

/** Rust shows the native confirm; a cancel comes back as `cancelled`. */
export function useRemoveHost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ipcVoid(CMD.REMOTE_REMOVE_HOST, { id }),
    meta: { quiet: true },
    onSuccess: (_d, id) => qc.removeQueries({ queryKey: remoteKeys.snapshot(id) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['remote'] }),
  });
}

/** Connect is only ever user-initiated. Its error is shown on the host
 * (kind-specific copy + action), so it's silent here. */
export function useConnectHost(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: remoteKeys.connect(id),
    mutationFn: () => ipc(CMD.REMOTE_CONNECT, { id }, connectionSchema),
    onSuccess: () => {
      qc.setQueryData<{ id: string; connected: boolean }[]>(remoteKeys.status(), (rows) => [
        ...(rows ?? []).filter((r) => r.id !== id),
        { id, connected: true },
      ]);
      // Clear a previous failure so the host doesn't keep showing it; the
      // snapshot observer refetches straight away.
      void qc.resetQueries({ queryKey: remoteKeys.snapshot(id) });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: remoteKeys.status() }),
    meta: { silent: true, quiet: true },
  });
}

export function useDisconnectHost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ipcVoid(CMD.REMOTE_DISCONNECT, { id }),
    meta: { quiet: true },
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: remoteKeys.snapshot(id) });
      qc.setQueryData<{ id: string; connected: boolean }[]>(remoteKeys.status(), (rows) =>
        (rows ?? []).map((r) => (r.id === id ? { ...r, connected: false } : r)),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: remoteKeys.status() }),
  });
}

/** The latest connect attempt for a host, as seen from anywhere (list row or
 * detail): pending → connecting, error → that error. */
export function useLastConnect(id: string): { pending: boolean; error: IpcError | null } {
  const states = useMutationState({
    filters: { mutationKey: remoteKeys.connect(id) },
    select: (m) => ({ status: m.state.status, error: m.state.error }),
  });
  const last = states.at(-1);
  return {
    pending: last?.status === 'pending',
    error: last?.status === 'error' ? IpcError.from(last.error) : null,
  };
}

/** Native confirm + journal live in Rust; a cancel comes back as `cancelled`
 * (no toast). Other failures toast, and the snapshot refreshes either way. */
export function useDockerAction(hostId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ container, action }: { container: string; action: DockerAction }) =>
      ipcVoid(CMD.REMOTE_DOCKER_ACTION, { id: hostId, container, action }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: remoteKeys.snapshot(hostId) });
      void qc.invalidateQueries({ queryKey: remoteKeys.journal() });
    },
    meta: { quiet: true },
  });
}
