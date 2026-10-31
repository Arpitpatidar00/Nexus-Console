import { invoke } from '@tauri-apps/api/core';
import type { ZodType } from 'zod';
import { IpcError } from './ipc-error';

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Browser preview (`npm run dev:web`) only. `import.meta.env.DEV` stays inline
// so production builds drop the mock branch — and its chunk — entirely.

/** The one typed IPC entry point: invoke a Rust command and zod-validate its
 * result at the trust boundary. Only this module talks to @tauri-apps/api. */
export async function ipc<T>(
  cmd: string,
  args: Record<string, unknown> | undefined,
  schema: ZodType<T>,
): Promise<T> {
  let raw: unknown;
  try {
    if (import.meta.env.DEV && !isTauri()) {
      raw = await (await import('./mockBackend')).mockInvoke(cmd, args);
    } else {
      raw = await invoke(cmd, args);
    }
  } catch (e) {
    throw IpcError.from(e);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw IpcError.fromZod(cmd, parsed.error);
  }
  return parsed.data;
}

/** For commands that return nothing (mutations). No result to validate. */
export async function ipcVoid(cmd: string, args?: Record<string, unknown>): Promise<void> {
  try {
    if (import.meta.env.DEV && !isTauri()) {
      await (await import('./mockBackend')).mockInvokeVoid(cmd, args);
    } else {
      await invoke(cmd, args);
    }
  } catch (e) {
    throw IpcError.from(e);
  }
}
