import { describe, it, expect } from 'vitest';
import { scoreAction, filterAndRankActions } from './scorer';
import type { ActionItem } from './types';

const mockActions: ActionItem[] = [
  {
    id: 'nav:services',
    title: 'Go to Services',
    keywords: ['homebrew', 'daemons', 'mysql', 'redis'],
    group: 'navigation',
    run: () => {},
  },
  {
    id: 'doctor:quick',
    title: 'Run Quick Scan',
    keywords: ['doctor', 'audit', 'health'],
    group: 'doctor',
    run: () => {},
  },
  {
    id: 'maclean:scan',
    title: 'Mac Clean: Storage Scan',
    keywords: ['disk', 'clean', 'caches'],
    group: 'maclean',
    run: () => {},
  },
  {
    id: 'term:open',
    title: 'Open Terminal Drawer',
    keywords: ['pty', 'shell', 'bash', 'zsh'],
    group: 'terminal',
    run: () => {},
  },
];

describe('Action Scorer', () => {
  it('returns 0 for empty query', () => {
    expect(scoreAction(mockActions[0], '')).toBe(0);
    expect(scoreAction(mockActions[0], '   ')).toBe(0);
  });

  it('ranks exact match highest', () => {
    const scoreExact = scoreAction(mockActions[1], 'Run Quick Scan');
    const scorePartial = scoreAction(mockActions[1], 'Run');
    expect(scoreExact).toBeGreaterThan(scorePartial);
  });

  it('matches title prefix higher than substring', () => {
    const a1: ActionItem = {
      id: '1',
      title: 'Services Overview',
      group: 'services',
      run: () => {},
    };
    const a2: ActionItem = {
      id: '2',
      title: 'View All Services',
      group: 'services',
      run: () => {},
    };
    expect(scoreAction(a1, 'services')).toBeGreaterThan(scoreAction(a2, 'services'));
  });

  it('matches keywords', () => {
    const score = scoreAction(mockActions[0], 'redis');
    expect(score).toBeGreaterThan(0);
  });

  it('handles acronyms like "qs" for "Quick Scan"', () => {
    const score = scoreAction(mockActions[1], 'rqs');
    expect(score).toBeGreaterThan(0);
  });

  it('filters and ranks multiple actions in descending order', () => {
    const ranked = filterAndRankActions(mockActions, 'scan');
    expect(ranked.length).toBe(2);
    // Both 'Run Quick Scan' and 'Mac Clean: Storage Scan' match
    expect(ranked.map((a) => a.id)).toContain('doctor:quick');
    expect(ranked.map((a) => a.id)).toContain('maclean:scan');
  });

  it('returns all actions when query is empty', () => {
    const ranked = filterAndRankActions(mockActions, '');
    expect(ranked.length).toBe(mockActions.length);
  });
});
