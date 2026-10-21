import { setActiveTab } from '@/shared/state/uiSlice';
import { openTerminal, setDrawerOpen } from '@/shared/state/terminalsSlice';
import { setTheme } from '@/shared/state/settingsSlice';
import type { ActionItem } from './types';

export const STATIC_ACTIONS: ActionItem[] = [
  // --- Navigation ---
  {
    id: 'nav:home',
    title: 'Go to Home',
    subtitle: 'Measured issues across your enabled modules',
    keywords: ['home', 'issues', 'overview', 'dashboard'],
    group: 'navigation',
    run: ({ navigate }) => navigate('home'),
  },
  {
    id: 'nav:services',
    title: 'Go to Services',
    subtitle: 'Manage local Homebrew services & daemons',
    keywords: ['homebrew', 'daemons', 'mysql', 'redis', 'postgres'],
    group: 'navigation',
    run: ({ dispatch, navigate }) => {
      dispatch(setActiveTab('services'));
      navigate('services');
    },
  },
  {
    id: 'nav:packages',
    title: 'Go to Packages',
    subtitle: 'View, install and update Homebrew formulas and casks',
    keywords: ['brew', 'kegs', 'casks', 'formulas', 'upgrade'],
    group: 'navigation',
    run: ({ dispatch, navigate }) => {
      dispatch(setActiveTab('packages'));
      navigate('packages');
    },
  },
  {
    id: 'nav:ports',
    title: 'Go to Ports',
    subtitle: 'Inspect listening TCP ports and kill stuck processes',
    keywords: ['listeners', 'network', 'kill', 'detached', 'processes'],
    group: 'navigation',
    run: ({ dispatch, navigate }) => {
      dispatch(setActiveTab('ports'));
      navigate('ports');
    },
  },
  {
    id: 'nav:remote',
    title: 'Go to Servers',
    subtitle: 'Manage remote Linux hosts over SSH',
    keywords: ['ssh', 'containers', 'docker', 'remote', 'vps'],
    group: 'navigation',
    when: (s) => s.settings.enabledModules?.includes('remote') ?? false,
    run: ({ dispatch, navigate }) => {
      dispatch(setActiveTab('servers'));
      navigate('servers');
    },
  },
  {
    id: 'nav:doctor',
    title: 'Go to Doctor',
    subtitle: 'Machine health diagnostics and maintenance',
    keywords: ['health', 'diagnostics', 'clean', 'system', 'audit'],
    group: 'navigation',
    when: (s) => s.settings.enabledModules?.includes('doctor') ?? false,
    run: ({ dispatch, navigate }) => {
      dispatch(setActiveTab('doctor'));
      navigate('doctor');
    },
  },
  {
    id: 'nav:storage',
    title: 'Go to Mac Clean: Storage',
    subtitle: 'Disk breakdown and developer cache reclamation',
    keywords: ['disk', 'storage', 'clean', 'caches', 'space', 'trash'],
    group: 'navigation',
    when: (s) => s.settings.enabledModules?.includes('maclean') ?? false,
    run: ({ dispatch, navigate }) => {
      dispatch(setActiveTab('storage'));
      navigate('storage');
    },
  },
  {
    id: 'nav:memory',
    title: 'Go to Mac Clean: Memory',
    subtitle: 'RAM breakdown, memory pressure and swap composition',
    keywords: ['ram', 'swap', 'memory', 'pressure'],
    group: 'navigation',
    when: (s) => s.settings.enabledModules?.includes('maclean') ?? false,
    run: ({ dispatch, navigate }) => {
      dispatch(setActiveTab('memory'));
      navigate('memory');
    },
  },
  {
    id: 'nav:sessions',
    title: 'Go to Claude Chats',
    subtitle: 'Search and browse Claude Code project conversations',
    keywords: ['claude', 'ai', 'history', 'archive'],
    group: 'navigation',
    when: (s) => s.settings.enabledModules?.includes('claude') ?? false,
    run: ({ dispatch, navigate }) => {
      dispatch(setActiveTab('sessions'));
      navigate('sessions');
    },
  },
  {
    id: 'nav:settings',
    title: 'Go to Settings',
    subtitle: 'Configure features, shortcuts and preferences',
    keywords: ['preferences', 'config', 'hotkey', 'theme'],
    group: 'navigation',
    run: ({ dispatch, navigate }) => {
      dispatch(setActiveTab('settings'));
      navigate('settings');
    },
  },

  // --- Terminal ---
  {
    id: 'term:toggle',
    title: 'Toggle Terminal Drawer',
    subtitle: 'Show or hide the shared built-in terminal',
    keywords: ['terminal', 'pty', 'shell', 'bash', 'zsh'],
    group: 'terminal',
    shortcut: '`',
    run: ({ dispatch }) => {
      dispatch((_, getState) => {
        const isOpen = getState().terminals.drawerOpen;
        dispatch(setDrawerOpen(!isOpen));
      });
    },
  },
  {
    id: 'term:new-shell',
    title: 'New Terminal Shell',
    subtitle: 'Open a local login shell in the terminal drawer',
    keywords: ['terminal', 'pty', 'shell', 'zsh', 'open'],
    group: 'terminal',
    run: ({ dispatch }) => {
      dispatch(
        openTerminal({
          target: { type: 'brew', formula: 'sh', kind: 'cli' },
          title: 'Shell',
        }),
      );
    },
  },

  // --- Theme ---
  {
    id: 'theme:system',
    title: 'Theme: Follow System',
    subtitle: 'Adapt theme automatically to macOS appearance',
    keywords: ['theme', 'appearance', 'auto', 'mode'],
    group: 'settings',
    run: ({ dispatch }) => {
      dispatch(setTheme('system'));
    },
  },
  {
    id: 'theme:light',
    title: 'Theme: Frost (Light)',
    subtitle: 'Light glass appearance',
    keywords: ['theme', 'appearance', 'light', 'white'],
    group: 'settings',
    run: ({ dispatch }) => {
      dispatch(setTheme('light'));
    },
  },
  {
    id: 'theme:dark',
    title: 'Theme: Smoked (Dark)',
    subtitle: 'Dark glass appearance',
    keywords: ['theme', 'appearance', 'dark', 'black'],
    group: 'settings',
    run: ({ dispatch }) => {
      dispatch(setTheme('dark'));
    },
  },
];
