import { CMD } from './commands';
import { IpcError } from './ipc-error';
import { ipcVoid } from './invoke';

const REPEAT_WINDOW_MS = 60_000;
const lastSeen = new Map<string, number>();

/** Should this error be written to the local log now? Same source+message
 * within a minute is dropped, so a failing poll can't fill the 200-entry log. */
export function shouldLog(key: string, now = Date.now()): boolean {
  const prev = lastSeen.get(key);
  if (prev !== undefined && now - prev < REPEAT_WINDOW_MS) return false;
  lastSeen.set(key, now);
  return true;
}

/** Record a failure in the local-only error log (PLAN G.4). Never throws, and a
 * failure to log is not itself logged or toasted. */
export function logError(source: 'ipc' | 'ui', e: unknown, command?: string): void {
  const kind = e instanceof IpcError ? e.kind : e instanceof Error ? e.name : 'unknown';
  const message = e instanceof Error ? e.message : String(e);
  if (!shouldLog(`${source}:${kind}:${message}`)) return;
  void ipcVoid(CMD.DIAG_LOG_ERROR, { source, kind, message, command }).catch(() => {});
}
