import { describe, it, expect } from 'vitest';
import {
  settingsReducer,
  setTheme,
  setLayout,
  setPollInterval,
  setEnabledModules,
  setCardOrder,
  setRemoteDeadmanMinutes,
  hydrateSettings,
} from './settingsSlice';

describe('settingsSlice', () => {
  const initial = settingsReducer(undefined, { type: '@@INIT' });

  it('updates theme', () => {
    const state = settingsReducer(initial, setTheme('dark'));
    expect(state.theme).toBe('dark');
  });

  it('updates layout', () => {
    const state = settingsReducer(initial, setLayout('list'));
    expect(state.layout).toBe('list');
  });

  it('updates poll interval', () => {
    const state = settingsReducer(initial, setPollInterval(2000));
    expect(state.pollIntervalMs).toBe(2000);
  });

  it('normalizes and updates enabled modules', () => {
    const state = settingsReducer(initial, setEnabledModules(['remote', 'doctor']));
    expect(state.enabledModules).toContain('remote');
    expect(state.enabledModules).toContain('doctor');
  });

  it('ignores setEnabledModules when given an empty list', () => {
    const stateWithModules = settingsReducer(initial, setEnabledModules(['homebrew']));
    const state = settingsReducer(stateWithModules, setEnabledModules([]));
    expect(state.enabledModules).toEqual(['homebrew']);
  });

  it('updates cardOrder', () => {
    const order = ['postgres', 'redis', 'nginx'];
    const state = settingsReducer(initial, setCardOrder(order));
    expect(state.cardOrder).toEqual(order);
  });

  it('updates remote deadman minutes', () => {
    const state = settingsReducer(initial, setRemoteDeadmanMinutes(15));
    expect(state.remoteDeadmanMinutes).toBe(15);
  });

  it('hydrates settings from disk', () => {
    const state = settingsReducer(
      initial,
      hydrateSettings({
        theme: 'light',
        pollIntervalMs: 5000,
        remoteDeadmanMinutes: 20,
      }),
    );
    expect(state.hydrated).toBe(true);
    expect(state.theme).toBe('light');
    expect(state.pollIntervalMs).toBe(5000);
    expect(state.remoteDeadmanMinutes).toBe(20);
  });
});
