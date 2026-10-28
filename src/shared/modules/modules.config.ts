import {
  Archive,
  Smartphone,
  Rocket,
  Cloud,
  HardDriveDownload,
  Wifi,
  Container,
  Database,
  FolderGit2,
  Clock,
  HardDrive,
  MemoryStick,
  Zap,
  LayoutGrid,
  Network,
  Package,
  Server,
  Stethoscope,
  Wrench,
  Waypoints,
  Globe,
  Laptop,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import type { Tab } from '@/shared/state/uiSlice';

/** The core modules forming the Stackroost developer console. Order is nav order. */
export const MODULE_IDS = [
  'homebrew',
  'ports',
  'remote',
  'doctor',
  'maclean',
  'claude',
  'docker',
  'databases',
  'kafka',
  'projects',
  'toolbox',
  'domains',
  'secrets',
  'cloud',
  'backups',
  'network',
  'devices',
  'releases',
] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

/** The hubs (PLAN F.1): every module lives in exactly one, and the rail shows
 * one icon per hub that has at least one enabled module. */
export type ModuleGroup = 'local' | 'servers' | 'projects' | 'mac' | 'cloud' | 'tools';

export const MODULE_GROUPS: { id: ModuleGroup; label: string; icon: LucideIcon }[] = [
  { id: 'local', label: 'Local', icon: LayoutGrid },
  { id: 'servers', label: 'Servers', icon: Server },
  { id: 'projects', label: 'Projects', icon: FolderGit2 },
  { id: 'mac', label: 'This Mac', icon: Laptop },
  { id: 'cloud', label: 'Cloud & Web', icon: Cloud },
  { id: 'tools', label: 'Tools', icon: Wrench },
];

/** What a module reads, changes and sends — shown on every page (PLAN F.4). */
export interface ModulePrivacy {
  reads: string;
  changes: string;
  network: string;
}

export type ModuleRequirement = 'claude';

export interface NavEntry {
  tab: Tab;
  label: string;
  icon: LucideIcon;
  group?: ModuleGroup;
}

export interface ModuleDef {
  id: ModuleId;
  label: string;
  group: ModuleGroup;
  icon: LucideIcon;
  nav: NavEntry[];
  blurb: string;
  privacy: ModulePrivacy;
  background: string | null;
  requires?: ModuleRequirement;
  optIn?: boolean;
}

export const MODULES: ModuleDef[] = [
  {
    id: 'homebrew',
    label: 'Homebrew',
    group: 'local',
    icon: LayoutGrid,
    nav: [
      { tab: 'services', label: 'Services', icon: LayoutGrid, group: 'local' },
      { tab: 'packages', label: 'Packages', icon: Package, group: 'local' },
      { tab: 'sessions', label: 'Sessions', icon: Clock, group: 'local' },
    ],
    blurb: 'Services, packages and versions.',
    privacy: {
      reads: 'brew list, brew services, Cellar versions',
      changes: 'Starts/stops services, installs and removes formulae — each confirmed',
      network: 'None (brew reaches its own mirrors)',
    },
    background: 'Checks Homebrew every few seconds and keeps the menu-bar count live.',
  },
  {
    id: 'ports',
    label: 'Ports',
    group: 'local',
    icon: Network,
    nav: [{ tab: 'ports', label: 'Ports', icon: Network, group: 'local' }],
    blurb: "See what's listening, kill what's stuck.",
    privacy: {
      reads: 'Listening sockets (lsof) and process info (ps)',
      changes: 'Stops a process you pick, after a native confirm',
      network: 'None (HTTP probe to 127.0.0.1 only)',
    },
    background: null,
  },
  {
    id: 'remote',
    label: 'Servers',
    group: 'servers',
    icon: Server,
    nav: [{ tab: 'servers', label: 'Servers', icon: Server, group: 'servers' }],
    blurb: 'Your SSH servers: health, containers, logs.',
    privacy: {
      reads: '~/.ssh/config (after you allow it) and server state over SSH',
      changes: 'Container and compose actions, deploys — confirmed and journaled',
      network: 'SSH to the servers you add',
    },
    background:
      'Optional: re-checks connected servers from the tray and notifies on new critical issues.',
    optIn: true,
  },
  {
    id: 'doctor',
    label: 'Doctor',
    group: 'mac',
    icon: Stethoscope,
    nav: [{ tab: 'doctor', label: 'Doctor', icon: Stethoscope, group: 'mac' }],
    blurb: 'Read-only machine health checks and cleanup.',
    privacy: {
      reads: 'Disk, VS Code state databases, cache folders — read-only',
      changes: 'Only fixes you confirm (VACUUM, cache cleanup)',
      network: 'None',
    },
    background: 'Optional daily VSCode cleanup while the app sits in the tray.',
  },
  {
    id: 'maclean',
    label: 'Mac Clean',
    group: 'mac',
    icon: HardDrive,
    nav: [
      { tab: 'storage', label: 'Storage', icon: HardDrive, group: 'mac' },
      { tab: 'memory', label: 'Memory', icon: MemoryStick, group: 'mac' },
      { tab: 'energy', label: 'Energy', icon: Zap, group: 'mac' },
    ],
    blurb: 'Where your disk went, safe cleanup, and memory & swap.',
    privacy: {
      reads: '~/Library folder sizes (after you allow it), vm_stat, swap, pmset',
      changes: 'Cleans the caches you tick, confirmed and journaled',
      network: 'None',
    },
    background: 'Optional: scheduled cleanup and a low-disk warning from the tray.',
  },
  {
    id: 'claude',
    label: 'Claude Chats',
    group: 'tools',
    icon: Archive,
    nav: [{ tab: 'archiver', label: 'Claude Chats', icon: Archive, group: 'tools' }],
    blurb: 'Browse and archive your Claude Code history.',
    privacy: {
      reads: '~/.claude/projects chat files',
      changes: 'Archive, restore and delete chats you pick',
      network: 'None',
    },
    background: 'Optional daily chat archiving while the app sits in the tray.',
    requires: 'claude',
  },
  {
    id: 'docker',
    label: 'Docker',
    group: 'local',
    icon: Container,
    nav: [{ tab: 'docker', label: 'Containers', icon: Container, group: 'local' }],
    blurb: 'Local container runtime, compose stacks, and logs.',
    privacy: {
      reads: 'Local Docker containers and compose stacks',
      changes: 'Start/stop/restart/remove containers you pick',
      network: 'None (local Docker socket)',
    },
    background: null,
    optIn: true,
  },
  {
    id: 'databases',
    label: 'Databases',
    group: 'local',
    icon: Database,
    nav: [{ tab: 'databases', label: 'Databases', icon: Database, group: 'local' }],
    blurb: 'Local & remote database client, schema inspector, and APFS branching.',
    privacy: {
      reads: 'Connections you add; passwords live in Keychain',
      changes: 'Read-only queries; snapshots you confirm',
      network: 'Database hosts you add (direct or via SSH tunnel)',
    },
    background: null,
    optIn: true,
  },
  {
    id: 'kafka',
    label: 'Kafka',
    group: 'local',
    icon: Waypoints,
    nav: [{ tab: 'kafka', label: 'Kafka', icon: Waypoints, group: 'local' }],
    blurb: 'Read-only Kafka explorer: brokers, topics, consumer lag and messages.',
    privacy: {
      reads: 'Clusters you add; SASL passwords live in an encrypted local vault',
      changes: 'Nothing on the cluster — no produce, no offset commits',
      network: 'The Kafka brokers of clusters you add',
    },
    background: null,
    optIn: true,
  },
  {
    id: 'projects',
    label: 'Projects',
    group: 'projects',
    icon: FolderGit2,
    nav: [{ tab: 'projects', label: 'Projects', icon: FolderGit2, group: 'projects' }],
    blurb: 'Git status, workspaces, saved commands, and GitHub PRs.',
    privacy: {
      reads: 'Git status of your project folders, saved workspaces',
      changes: 'git fetch, deleting merged branches, starting workspace services',
      network: 'GitHub through your gh CLI (PR status)',
    },
    background: null,
  },
  {
    id: 'toolbox',
    label: 'Dev Toolbox',
    group: 'tools',
    icon: Wrench,
    nav: [{ tab: 'toolbox', label: 'Dev Toolbox', icon: Wrench, group: 'tools' }],
    blurb: 'Offline converters, regex tester, cron, hashes & tokens.',
    privacy: {
      reads: 'Only what you type',
      changes: 'Nothing (all in memory)',
      network: 'None',
    },
    background: null,
  },
  {
    id: 'domains',
    label: 'Domains & Uptime',
    group: 'cloud',
    icon: Globe,
    nav: [{ tab: 'domains', label: 'Domains & Uptime', icon: Globe, group: 'cloud' }],
    blurb: 'RDAP expiry, DNS lookup, SSL check & uptime monitoring.',
    privacy: {
      reads: 'DNS, TLS certificates and RDAP for domains you enter',
      changes: 'Saves your monitors; background checks only when enabled',
      network: 'rdap.org, public DNS resolvers, URLs you monitor',
    },
    background:
      'Optional: checks monitored URLs periodically and alerts on downtime or SSL expiry.',
    optIn: true,
  },
  {
    id: 'devices',
    label: 'Simulators & AVDs',
    group: 'mac',
    icon: Smartphone,
    nav: [{ tab: 'devices', label: 'Simulators & AVDs', icon: Smartphone, group: 'mac' }],
    blurb: 'iOS Simulators, Android AVDs, lifecycle controls & build cache cleaner.',
    privacy: {
      reads: 'simctl and emulator device lists, logcat',
      changes: 'Boots, stops and installs onto simulators and emulators',
      network: 'None',
    },
    background: null,
    optIn: true,
  },
  {
    id: 'releases',
    label: 'Release Config',
    group: 'projects',
    icon: Rocket,
    nav: [{ tab: 'releases', label: 'Release Config', icon: Rocket, group: 'projects' }],
    blurb: 'Local project version names, build numbers, and Fastlane deployment lanes.',
    privacy: {
      reads: 'pubspec.yaml, package.json, fastlane/Fastfile',
      changes: 'Nothing',
      network: 'None',
    },
    background: null,
    optIn: true,
  },
  {
    id: 'cloud',
    label: 'Cloud AWS',
    group: 'cloud',
    icon: Cloud,
    nav: [{ tab: 'cloud', label: 'Cloud AWS', icon: Cloud, group: 'cloud' }],
    blurb: 'AWS profiles, EC2 instances, S3 buckets & cached cost tracking.',
    privacy: {
      reads: '~/.aws profiles (after you allow it), EC2, S3, costs on click',
      changes: 'EC2 start/stop/reboot — prod needs a typed confirm',
      network: 'AWS via your aws CLI (*.amazonaws.com)',
    },
    background: null,
    optIn: true,
  },
  {
    id: 'backups',
    label: 'Backups',
    group: 'servers',
    icon: HardDriveDownload,
    nav: [{ tab: 'backups', label: 'Backups', icon: HardDriveDownload, group: 'servers' }],
    blurb: 'Coming back after safety review: Automated database dumps & project .env archives.',
    privacy: {
      reads: 'Database dumps over your SSH hosts, project .env files',
      changes: 'Writes 0600 archives in the app data folder',
      network: 'SSH to the servers you add',
    },
    background: null,
    optIn: true,
  },
  {
    id: 'network',
    label: 'Network & Chaos',
    group: 'mac',
    icon: Wifi,
    nav: [{ tab: 'network', label: 'Network & Chaos', icon: Wifi, group: 'mac' }],
    blurb: 'Live per-app bandwidth, DNS cache flush, hosts file editor & TCP chaos proxy.',
    privacy: {
      reads: 'Per-app bandwidth (nettop), /etc/hosts',
      changes: 'DNS flush, managed /etc/hosts block, local chaos proxy',
      network: 'None (chaos proxy listens on 127.0.0.1)',
    },
    background: null,
    optIn: true,
  },
  {
    id: 'secrets',
    label: 'Secrets Scanner',
    group: 'projects',
    icon: ShieldAlert,
    nav: [{ tab: 'secrets', label: 'Secrets Scanner', icon: ShieldAlert, group: 'projects' }],
    blurb: 'Detect committed secrets, unignored .env files & leaked keys.',
    privacy: {
      reads: 'Project .env files and shell history (each after you allow it)',
      changes: 'Nothing',
      network: 'None',
    },
    background: null,
    optIn: true,
  },
];

export const moduleById = (id: ModuleId): ModuleDef =>
  MODULES.find((m) => m.id === id) ?? MODULES[0];
