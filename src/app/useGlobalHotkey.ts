import { useEffect } from 'react';
import { toast } from 'sonner';
import { useAppSelector } from '@/shared/state/hooks';
import { CMD, ipcVoid } from '@/shared/tauri';
import { GLOBAL_HOTKEY } from '@/shared/lib/globalHotkey';

/** Registers the show/hide shortcut in Rust whenever the setting changes —
 * it used to be saved and never registered. Any older stored value maps to
 * the supported shortcut. */
export function useGlobalHotkey() {
  const hydrated = useAppSelector((s) => s.settings.hydrated);
  const enabled = useAppSelector((s) => s.settings.globalHotkey !== null);

  useEffect(() => {
    if (!hydrated) return;
    ipcVoid(CMD.SYSTEM_SET_GLOBAL_HOTKEY, { shortcut: enabled ? GLOBAL_HOTKEY : null }).catch(
      (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not set the shortcut'),
    );
  }, [hydrated, enabled]);
}
