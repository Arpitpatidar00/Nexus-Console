import { describe, it, expect } from 'vitest';
import {
  discoveredProjectSchema,
  workspaceConfigSchema,
  gitHubStatusSchema,
} from './projects.schema';

describe('projects.schema', () => {
  it('parses valid discovered project with git info', () => {
    const raw = {
      name: 'Stackroost',
      path: '/Users/dev/Desktop/Stackroost',
      framework: 'Vite',
      git: {
        branch: 'feat/mac-clean',
        dirtyCount: 2,
        ahead: 1,
        behind: 0,
        stashCount: 1,
        lastCommit: {
          hash: 'abc1234',
          message: 'feat: add local data',
          relativeTime: '2 hours ago',
          author: 'Developer',
        },
        mergedBranches: ['feature-old'],
      },
    };
    const parsed = discoveredProjectSchema.parse(raw);
    expect(parsed.name).toBe('Stackroost');
    expect(parsed.framework).toBe('Vite');
    expect(parsed.git?.dirtyCount).toBe(2);
  });

  it('parses workspace configuration', () => {
    const raw = {
      id: 'ws_1',
      name: 'Stackroost Fullstack',
      projectPath: '/Users/dev/Desktop/Stackroost',
      brewServices: ['postgresql@16', 'redis'],
      composeProjects: ['backend'],
      tunnels: ['tun_1'],
      openVscode: true,
      savedCommands: [
        {
          id: 'cmd_1',
          projectPath: '/Users/dev/Desktop/Stackroost',
          name: 'Run Dev',
          command: 'npm run dev',
        },
      ],
    };
    const parsed = workspaceConfigSchema.parse(raw);
    expect(parsed.name).toBe('Stackroost Fullstack');
    expect(parsed.brewServices).toHaveLength(2);
    expect(parsed.openVscode).toBe(true);
  });

  it('parses GitHub status', () => {
    const raw = {
      ghInstalled: true,
      loggedIn: true,
      pullRequests: [
        {
          number: 42,
          title: 'Implement projects',
          state: 'OPEN',
          url: 'https://github.com/org/repo/pull/42',
          headRefName: 'feat/projects',
        },
      ],
      ciStatus: 'All checks passed',
    };
    const parsed = gitHubStatusSchema.parse(raw);
    expect(parsed.ghInstalled).toBe(true);
    expect(parsed.pullRequests).toHaveLength(1);
    expect(parsed.pullRequests[0].number).toBe(42);
  });
});
