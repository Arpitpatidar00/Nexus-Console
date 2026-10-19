import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { appendSample, sampleOf, type Sample } from '@/features/remote/utils/history';
import { snapshotSchema } from './remote.schema';

// In-memory CPU/RAM history per host, fed from the snapshot cache: not React
// Query data (it isn't Rust's), not Redux (it isn't user intent, and nothing
// persists it). Gone when the app quits, by design.
const history = new Map<string, Sample[]>();
const listeners = new Set<() => void>();
const EMPTY: Sample[] = [];

function record(id: string, raw: unknown) {
  const parsed = snapshotSchema.safeParse(raw);
  if (!parsed.success) return;
  const prev = history.get(id) ?? EMPTY;
  const next = appendSample(prev, sampleOf(parsed.data));
  if (next === prev) return;
  history.set(id, next);
  listeners.forEach((l) => l());
}

/** Mount once (RemotePage): records every successful snapshot, whether it
 * came from a poll, Check all, or a background check. */
export function useRecordHostHistory() {
  const qc = useQueryClient();
  useEffect(
    () =>
      qc.getQueryCache().subscribe((e) => {
        if (e.type !== 'updated' || e.action.type !== 'success') return;
        const [a, b, id] = e.query.queryKey as unknown[];
        if (a === 'remote' && b === 'snapshot' && typeof id === 'string') {
          record(id, e.query.state.data);
        }
      }),
    [qc],
  );
}

export function useHostHistory(id: string): Sample[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => history.get(id) ?? EMPTY,
  );
}
