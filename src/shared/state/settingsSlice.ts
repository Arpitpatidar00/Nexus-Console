import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { MODULE_IDS, type ModuleId } from '@/shared/modules/modules.config';

export type ThemeMode = 'system' | 'light' | 'dark';
export type Layout = 'grid' | 'list';
export type QuitBehavior = 'stopUnlinked' | 'keepAll';

interface SettingsState {
  theme: ThemeMode;
  layout: Layout;
  pollIntervalMs: number;
  /** Servers tab snapshot refresh; 0 = manual only. */
  remotePollIntervalMs: number;
  /** Tray re-check of connected servers, in minutes; 0 = off. Read by Rust
   * (`remote::background`) from the same store file. */
  remoteBackgroundMinutes: number;
  /** Mac Clean tray automation, read by Rust (`maclean::background`); 0 = off. */
  macleanAutoCleanDays: number;
  macleanLowDiskGb: number;
  quitBehavior: QuitBehavior;
  /** User drag-reorder of service cards, by formula. Unknown/new formulas sort last. */
  cardOrder: string[];
  /** Which feature modules the user runs. `null` = never chosen → the first-run
   * picker decides. Validated on read (see sanitizeModules) since it comes off
   * a user-editable file. */
  enabledModules: ModuleId[] | null;
  /** Tray automation (read by the Rust scheduler from the same store file). */
  autoArchiveEnabled: boolean;
  autoArchiveCutoffDays: number;
  autoVacuumEnabled: boolean;
  /** Global hotkey string (e.g. CommandOrControl+Alt+Space) or null if unset. */
  globalHotkey: string | null;
  /** Minutes of idle before auto-disconnecting prod servers (0 = off, default 10). */
  remoteDeadmanMinutes: number;
  /** false until persisted settings are loaded from tauri-store on boot. */
  hydrated: boolean;
}

/** The subset written to disk (never persist `hydrated`). */
export type PersistedSettings = Pick<
  SettingsState,
  | 'theme'
  | 'layout'
  | 'pollIntervalMs'
  | 'remotePollIntervalMs'
  | 'remoteBackgroundMinutes'
  | 'macleanAutoCleanDays'
  | 'macleanLowDiskGb'
  | 'quitBehavior'
  | 'cardOrder'
  | 'enabledModules'
  | 'autoArchiveEnabled'
  | 'autoArchiveCutoffDays'
  | 'autoVacuumEnabled'
  | 'globalHotkey'
  | 'remoteDeadmanMinutes'
>;

const initialState: SettingsState = {
  theme: 'system',
  layout: 'grid',
  pollIntervalMs: 4000,
  remotePollIntervalMs: 10_000,
  remoteBackgroundMinutes: 0,
  macleanAutoCleanDays: 0,
  macleanLowDiskGb: 0,
  quitBehavior: 'stopUnlinked',
  cardOrder: [],
  enabledModules: null,
  autoArchiveEnabled: false,
  autoArchiveCutoffDays: 30,
  autoVacuumEnabled: false,
  globalHotkey: null,
  remoteDeadmanMinutes: 10,
  hydrated: false,
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setTheme(state, action: PayloadAction<ThemeMode>) {
      state.theme = action.payload;
    },
    setLayout(state, action: PayloadAction<Layout>) {
      state.layout = action.payload;
    },
    setPollInterval(state, action: PayloadAction<number>) {
      state.pollIntervalMs = action.payload;
    },
    setRemotePollInterval(state, action: PayloadAction<number>) {
      state.remotePollIntervalMs = action.payload;
    },
    setRemoteBackgroundMinutes(state, action: PayloadAction<number>) {
      state.remoteBackgroundMinutes = action.payload;
    },
    setMacleanAutoCleanDays(state, action: PayloadAction<number>) {
      state.macleanAutoCleanDays = action.payload;
    },
    setMacleanLowDiskGb(state, action: PayloadAction<number>) {
      state.macleanLowDiskGb = action.payload;
    },
    setQuitBehavior(state, action: PayloadAction<QuitBehavior>) {
      state.quitBehavior = action.payload;
    },
    setCardOrder(state, action: PayloadAction<string[]>) {
      state.cardOrder = action.payload;
    },
    /** At least one feature module must stay on — an app with no feature tabs is
     * a brick, so the empty state is unrepresentable in the store rather than
     * merely unreachable through the UI. Also normalizes to registry order. */
    setEnabledModules(state, action: PayloadAction<ModuleId[]>) {
      const next = MODULE_IDS.filter((id) => action.payload.includes(id));
      if (next.length === 0) return;
      state.enabledModules = next;
    },
    setAutoArchiveEnabled(state, action: PayloadAction<boolean>) {
      state.autoArchiveEnabled = action.payload;
    },
    setAutoArchiveCutoffDays(state, action: PayloadAction<number>) {
      state.autoArchiveCutoffDays = action.payload;
    },
    setAutoVacuumEnabled(state, action: PayloadAction<boolean>) {
      state.autoVacuumEnabled = action.payload;
    },
    setGlobalHotkey(state, action: PayloadAction<string | null>) {
      state.globalHotkey = action.payload;
    },
    setRemoteDeadmanMinutes(state, action: PayloadAction<number>) {
      state.remoteDeadmanMinutes = action.payload;
    },
    hydrateSettings(state, action: PayloadAction<Partial<PersistedSettings>>) {
      Object.assign(state, action.payload);
      state.hydrated = true;
    },
  },
});

export const {
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
  setGlobalHotkey,
  setRemoteDeadmanMinutes,
  hydrateSettings,
} = settingsSlice.actions;
export const settingsReducer = settingsSlice.reducer;
