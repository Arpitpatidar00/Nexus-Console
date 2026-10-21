import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CMD, IpcError, ipcVoid, logError } from '@/shared/tauri';

// Types the two `meta` flags the app actually uses, so neither the toast
// suppression below nor the ActivityBar has to cast `unknown`.
declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: {
      /** Errors render inline (e.g. a server's connection state), not as a toast. */
      silent?: boolean;
    };
    mutationMeta: {
      /** Opt out of the per-item error toast (bulk ops toast once, aggregated). */
      silent?: boolean;
      /** Verb shown in the ActivityBar while this runs, e.g. 'Starting'. */
      label?: string;
      /** Keep out of the ActivityBar: the UI shows this one's progress inline
       * (and the bar's copy is about Homebrew). */
      quiet?: boolean;
    };
  }
}

const describe = (e: unknown) =>
  e instanceof IpcError || e instanceof Error ? e.message : 'Something went wrong';

// Central error surface: any query/mutation failure → one toast.
// A dismissed native confirm ('cancelled') is a user decision, not an error.
// 'busy' is Homebrew mid-self-upgrade — transient, self-clearing, and nothing
// to act on, so it gets a calm info toast rather than an alarming red one.
const notify = (e: unknown) => {
  if (e instanceof IpcError && e.kind === 'cancelled') return;
  // Homebrew 6 refuses to load anything from a tap the user hasn't trusted, and
  // it fails the whole command — one untrusted tap breaks installs, versions and
  // the package list. A red toast is a dead end, so offer the one-click fix
  // (`trust_tap` explains itself in a native sheet before running).
  if (e instanceof IpcError && e.kind === 'untrustedTap' && e.detail) {
    const tap = e.detail;
    toast.error(describe(e), {
      id: `untrusted-tap:${tap}`, // the 4s poll would stack one toast per tick
      duration: Infinity,
      action: {
        label: 'Trust tap',
        onClick: () => {
          void ipcVoid(CMD.TRUST_TAP, { tap })
            .then(() => {
              toast.dismiss(`untrusted-tap:${tap}`);
              void queryClient.invalidateQueries();
            })
            .catch(notify);
        },
      },
    });
    return;
  }
  if (e instanceof IpcError && e.kind === 'busy') {
    // Fixed id: the 4s poll would otherwise stack one toast per tick for the
    // whole time brew is busy. Sonner replaces same-id toasts instead.
    toast.info(describe(e), { id: 'brew-busy' });
    return;
  }
  toast.error(describe(e));
};

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (e, query) => {
      if (query.meta?.silent) return;
      if (!(e instanceof IpcError && e.kind === 'cancelled')) {
        logError('ipc', e, query.queryKey.slice(0, 2).join('/'));
      }
      notify(e);
    },
  }),
  // Bulk mutations mark themselves `meta.silent` and report one aggregated
  // toast, so skip the per-item auto-toast for those.
  mutationCache: new MutationCache({
    onError: (e, _vars, _ctx, mutation) => {
      if (mutation.meta?.silent) return;
      if (!(e instanceof IpcError && e.kind === 'cancelled')) {
        logError('ipc', e, mutation.options.mutationKey?.join('/'));
      }
      notify(e);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 2_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});
