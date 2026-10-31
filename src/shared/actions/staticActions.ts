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
    id: 'nav:docker',
    title: 'Go to Docker',
    subtitle: 'Manage local container runtime and compose stacks',
    keywords: ['docker', 'containers', 'compose', 'images'],
    group: 'navigation',
    when: (s) => s.settings.enabledModules?.includes('docker') ?? false,
    run: ({ dispatch, navigate }) => {
      dispatch(setActiveTab('docker'));
      navigate('docker');
    },
  },
  {
    id: 'nav:databases',
    title: 'Go to Databases',
    subtitle: 'Local & remote database client, schema inspector and query editor',
    keywords: ['database', 'databases', 'sql', 'postgres', 'mysql', 'redis', 'schema', 'query'],
    group: 'navigation',
    when: (s) => s.settings.enabledModules?.includes('databases') ?? false,
    run: ({ dispatch, navigate }) => {
      dispatch(setActiveTab('databases'));
      navigate('databases');
    },
  },
  {
    id: 'nav:kafka',
    title: 'Go to Kafka',
    subtitle: 'Kafka clusters, topics, consumer groups and messages',
    keywords: ['kafka', 'clusters', 'topics', 'consumer', 'lag', 'messages', 'broker'],
    group: 'navigation',
    when: (s) => s.settings.enabledModules?.includes('kafka') ?? false,
    run: ({ dispatch, navigate }) => {
      dispatch(setActiveTab('kafka'));
      navigate('kafka');
    },
  },
  {
    id: 'nav:projects',
    title: 'Go to Projects',
    subtitle: 'Git status, workspaces, saved commands, and GitHub PRs',
    keywords: ['projects', 'git', 'workspaces', 'repo', 'github', 'pr'],
    group: 'navigation',
    when: (s) => s.settings.enabledModules?.includes('projects') ?? false,
    run: ({ dispatch, navigate }) => {
      dispatch(setActiveTab('projects'));
      navigate('projects');
    },
  },
  {
    id: 'nav:toolbox',
    title: 'Go to Dev Toolbox',
    subtitle: 'Offline converters, regex tester, cron, hashes & tokens',
    keywords: ['toolbox', 'tools', 'regex', 'cron', 'base64', 'jwt', 'hash'],
    group: 'navigation',
    when: (s) => s.settings.enabledModules?.includes('toolbox') ?? false,
    run: ({ dispatch, navigate }) => {
      dispatch(setActiveTab('toolbox'));
      navigate('toolbox');
    },
  },
  {
    id: 'nav:domains',
    title: 'Go to Domains & Uptime',
    subtitle: 'RDAP expiry, DNS lookup, SSL check & uptime monitoring',
    keywords: ['domains', 'dns', 'ssl', 'uptime', 'rdap', 'whois', 'cert'],
    group: 'navigation',
    when: (s) => s.settings.enabledModules?.includes('domains') ?? false,
    run: ({ dispatch, navigate }) => {
      dispatch(setActiveTab('domains'));
      navigate('domains');
    },
  },
  {
    id: 'nav:secrets',
    title: 'Go to Secrets Scanner',
    subtitle: 'Detect committed secrets, unignored .env files & leaked keys',
    keywords: ['secrets', 'scanner', 'keys', 'credentials', 'env'],
    group: 'navigation',
    when: (s) => s.settings.enabledModules?.includes('secrets') ?? false,
    run: ({ dispatch, navigate }) => {
      dispatch(setActiveTab('secrets'));
      navigate('secrets');
    },
  },
  {
    id: 'nav:cloud',
    title: 'Go to Cloud AWS',
    subtitle: 'AWS profiles, EC2 instances, S3 buckets & cost tracking',
    keywords: ['cloud', 'aws', 'ec2', 's3', 'costs', 'instances'],
    group: 'navigation',
    when: (s) => s.settings.enabledModules?.includes('cloud') ?? false,
    run: ({ dispatch, navigate }) => {
      dispatch(setActiveTab('cloud'));
      navigate('cloud');
    },
  },
  {
    id: 'nav:backups',
    title: 'Go to Backups',
    subtitle: 'Database dumps and project .env archives',
    keywords: ['backups', 'backup', 'dumps', 'archive'],
    group: 'navigation',
    when: (s) => s.settings.enabledModules?.includes('backups') ?? false,
    run: ({ dispatch, navigate }) => {
      dispatch(setActiveTab('backups'));
      navigate('backups');
    },
  },
  {
    id: 'nav:network',
    title: 'Go to Network & Chaos',
    subtitle: 'Bandwidth monitor, DNS flush, hosts editor & chaos proxy',
    keywords: ['network', 'chaos', 'bandwidth', 'hosts', 'dns', 'proxy'],
    group: 'navigation',
    when: (s) => s.settings.enabledModules?.includes('network') ?? false,
    run: ({ dispatch, navigate }) => {
      dispatch(setActiveTab('network'));
      navigate('network');
    },
  },
  {
    id: 'nav:devices',
    title: 'Go to Simulators & AVDs',
    subtitle: 'iOS Simulators and Android AVD lifecycle controls',
    keywords: ['devices', 'simulators', 'android', 'ios', 'emulator'],
    group: 'navigation',
    when: (s) => s.settings.enabledModules?.includes('devices') ?? false,
    run: ({ dispatch, navigate }) => {
      dispatch(setActiveTab('devices'));
      navigate('devices');
    },
  },
  {
    id: 'nav:releases',
    title: 'Go to Release Config',
    subtitle: 'Version names, build numbers, and Fastlane lanes',
    keywords: ['releases', 'release', 'config', 'build', 'version', 'fastlane'],
    group: 'navigation',
    when: (s) => s.settings.enabledModules?.includes('releases') ?? false,
    run: ({ dispatch, navigate }) => {
      dispatch(setActiveTab('releases'));
      navigate('releases');
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
