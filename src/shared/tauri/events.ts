import { useEffect } from 'react';
import { listen, type EventCallback } from '@tauri-apps/api/event';

/** Subscribe to a Tauri event for the component's lifetime. Used by the PTY
 * stream (P4). Keep the handler stable (React Compiler memoizes it). */
export function useIpcEvent<T>(event: string, handler: EventCallback<T>): void {
  useEffect(() => {
    let active = true;
    let unlistenFn: (() => void) | undefined;
    try {
      const unlisten = listen<T>(event, handler);
      void unlisten
        .then((fn) => {
          if (active) unlistenFn = fn;
          else fn?.();
        })
        .catch(() => {});
    } catch {
      // Non-Tauri fallback
    }
    return () => {
      active = false;
      unlistenFn?.();
    };
  }, [event, handler]);
}
