import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import { load, type Store } from '@tauri-apps/plugin-store';
import type { RootState } from './rootReducer';
import {
  setTheme,
  setLayout,
  setPollInterval,
  setRemotePollInterval,
  setRemoteBackgroundMinutes,
  setMacleanAutoCleanDays,
  setMacleanLowDiskGb,
  setQuitBehavior,
  setCardOrder,
  setEnabledModules,
  setAutoArchiveEnabled,
  setAutoArchiveCutoffDays,
  setAutoVacuumEnabled,
  setFavoritePorts,
  toggleFavoritePort,
  addRecentCommandId,
  setRecentCommandIds,
  setGlobalHotkey,
  setRemoteDeadmanMinutes,
  togglePinnedCommand,
  PERSISTED_KEYS,
  type PersistedSettings,
} from './settingsSlice';

const FILE = 'settings.json';
const KEY = 'settings';

let cached: Promise<Store> | null = null;
const getStore = () => (cached ??= load(FILE, { autoSave: false, defaults: {} }));

/** Read persisted settings on boot. Returns null on first run or non-Tauri dev. */
export async function loadPersistedSettings(): Promise<Partial<PersistedSettings> | null> {
  try {
    const store = await getStore();
    const val = await store.get<Partial<PersistedSettings>>(KEY);
    if (val) return val;
  } catch {
    // Non-Tauri fallback
  }
  try {
    const raw = localStorage.getItem('stackroost_settings');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Writes settings back to disk whenever one changes.
// ponytail: no debounce — settings toggles are infrequent; add one if it churns.
export const settingsListener = createListenerMiddleware();
settingsListener.startListening({
  matcher: isAnyOf(
    setTheme,
    setLayout,
    setPollInterval,
    setRemotePollInterval,
    setRemoteBackgroundMinutes,
    setMacleanAutoCleanDays,
    setMacleanLowDiskGb,
    setQuitBehavior,
    setCardOrder,
    setEnabledModules,
    setAutoArchiveEnabled,
    setAutoArchiveCutoffDays,
    setAutoVacuumEnabled,
    setFavoritePorts,
    toggleFavoritePort,
    addRecentCommandId,
    setRecentCommandIds,
    setGlobalHotkey,
    setRemoteDeadmanMinutes,
    togglePinnedCommand,
  ),
  effect: async (_action, api) => {
    const settings = (api.getState() as RootState).settings;
    const persisted = Object.fromEntries(PERSISTED_KEYS.map((k) => [k, settings[k]]));
    try {
      const store = await getStore();
      await store.set(KEY, persisted);
      await store.save();
    } catch {
      try {
        localStorage.setItem('stackroost_settings', JSON.stringify(persisted));
      } catch {
        /* best-effort */
      }
    }
  },
});
