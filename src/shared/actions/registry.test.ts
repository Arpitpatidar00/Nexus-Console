import { describe, it, expect } from 'vitest';
import { STATIC_ACTIONS } from './staticActions';
import type { RootState } from '@/shared/state/rootReducer';

describe('Action Registry', () => {
  it('ensures all static action IDs are unique', () => {
    const ids = new Set<string>();
    for (const action of STATIC_ACTIONS) {
      expect(ids.has(action.id), `Duplicate action id: ${action.id}`).toBe(false);
      ids.add(action.id);
    }
  });

  it('filters actions correctly with `when` condition', () => {
    const dummyStateEnabled = {
      settings: {
        enabledModules: ['remote', 'doctor', 'maclean'],
      },
    } as unknown as RootState;

    const dummyStateDisabled = {
      settings: {
        enabledModules: ['services'],
      },
    } as unknown as RootState;

    const remoteAction = STATIC_ACTIONS.find((a) => a.id === 'nav:remote');
    expect(remoteAction).toBeDefined();
    expect(remoteAction?.when?.(dummyStateEnabled)).toBe(true);
    expect(remoteAction?.when?.(dummyStateDisabled)).toBe(false);
  });
});
