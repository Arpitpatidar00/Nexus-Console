import { describe, it, expect } from 'vitest';
import { xtermTheme } from './utils/xtermTheme';

describe('terminal module utilities', () => {
  it('returns valid fallback xterm theme when CSS variables are unset', () => {
    const theme = xtermTheme();
    expect(theme.background).toBe('#202020');
    expect(theme.foreground).toBe('#e3e6eb');
    expect(theme.cursor).toBe('#e3e6eb');
    expect(theme.cursorAccent).toBe('#202020');
    expect(theme.selectionBackground).toBe('#33415580');
  });

  it('provides all required theme color keys for xterm renderer', () => {
    const theme = xtermTheme();
    expect(theme).toHaveProperty('background');
    expect(theme).toHaveProperty('foreground');
    expect(theme).toHaveProperty('cursor');
    expect(theme).toHaveProperty('cursorAccent');
    expect(theme).toHaveProperty('selectionBackground');
  });
});
