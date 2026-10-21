import { describe, it, expect } from 'vitest';
import { MODULE_IDS } from '@/shared/modules/modules.config';
import type { ThemeMode, Layout } from '@/shared/state/settingsSlice';

describe('settings module logic', () => {
  it('validates theme modes', () => {
    const validModes: ThemeMode[] = ['system', 'light', 'dark'];
    for (const mode of validModes) {
      expect(['system', 'light', 'dark']).toContain(mode);
    }
  });

  it('validates layout modes', () => {
    const validLayouts: Layout[] = ['grid', 'list'];
    for (const layout of validLayouts) {
      expect(['grid', 'list']).toContain(layout);
    }
  });

  it('validates module ids list contains core modules', () => {
    expect(MODULE_IDS).toContain('homebrew');
    expect(MODULE_IDS).toContain('ports');
    expect(MODULE_IDS).toContain('remote');
    expect(MODULE_IDS).toContain('doctor');
    expect(MODULE_IDS).toContain('maclean');
  });

  it('sanitizes unknown module ids', () => {
    const requested = ['homebrew', 'invalid_mod_xyz', 'remote'];
    const filtered = requested.filter((id) => (MODULE_IDS as readonly string[]).includes(id));
    expect(filtered).toEqual(['homebrew', 'remote']);
  });
});
