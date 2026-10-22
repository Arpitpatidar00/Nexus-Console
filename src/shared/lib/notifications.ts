import { useSyncExternalStore } from 'react';

// In-memory feed behind the header bell: what failed and what finished, so a
// toast that vanished after 4s is still findable. Session-only by design.
export interface AppNotification {
  id: number;
  at: number;
  kind: 'error' | 'success' | 'info';
  title: string;
}

const MAX = 50;
let items: AppNotification[] = [];
let lastSeen = 0;
let seq = 0;
const listeners = new Set<() => void>();
let snapshot = { items, unread: 0 };

const emit = () => {
  snapshot = { items, unread: items.filter((n) => n.at > lastSeen).length };
  for (const l of listeners) l();
};

export function pushNotification(kind: AppNotification['kind'], title: string): void {
  // The 4s polls re-raise the same failure every tick — keep one entry.
  if (items[0]?.title === title && items[0].kind === kind) return;
  items = [{ id: ++seq, at: Date.now(), kind, title }, ...items].slice(0, MAX);
  emit();
}

export function markNotificationsSeen(): void {
  lastSeen = Date.now();
  emit();
}

export function clearNotifications(): void {
  items = [];
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useNotifications = () => useSyncExternalStore(subscribe, () => snapshot);
