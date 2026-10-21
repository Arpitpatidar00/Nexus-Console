import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export const TABS = [
  'home',
  'services',
  'doctor',
  'archiver',
  'packages',
  'ports',
  'servers',
  'storage',
  'memory',
  'energy',
  'sessions',
  'docker',
  'databases',
  'projects',
  'toolbox',
  'domains',
  'secrets',
  'cloud',
  'backups',
  'network',
  'devices',
  'releases',
  'settings',
] as const;
export type Tab = (typeof TABS)[number];

interface UiState {
  activeTab: Tab;
  /** Last page opened inside each hub, so re-selecting a hub returns there. */
  lastTabByHub: Partial<Record<string, Tab>>;
}

const initialState: UiState = { activeTab: 'home', lastTabByHub: {} };

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setActiveTab(state, action: PayloadAction<Tab>) {
      state.activeTab = action.payload;
    },
    rememberHubTab(state, action: PayloadAction<{ hub: string; tab: Tab }>) {
      state.lastTabByHub[action.payload.hub] = action.payload.tab;
    },
  },
});

export const { setActiveTab, rememberHubTab } = uiSlice.actions;
export const uiReducer = uiSlice.reducer;
