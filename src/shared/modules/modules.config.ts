import {
  Archive,
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
  Globe,
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
  'projects',
  'toolbox',
  'domains',
  'secrets',
] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export type ModuleGroup = 'local' | 'remote' | 'mac' | 'tools';

export const MODULE_GROUPS: { id: ModuleGroup; label: string }[] = [
  { id: 'local', label: 'Local' },
  { id: 'remote', label: 'Remote' },
  { id: 'mac', label: 'This Mac' },
  { id: 'tools', label: 'Tools' },
];

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
    background: 'Checks Homebrew every few seconds and keeps the menu-bar count live.',
  },
  {
    id: 'ports',
    label: 'Ports',
    group: 'local',
    icon: Network,
    nav: [{ tab: 'ports', label: 'Ports', icon: Network, group: 'local' }],
    blurb: "See what's listening, kill what's stuck.",
    background: null,
  },
  {
    id: 'remote',
    label: 'Servers',
    group: 'remote',
    icon: Server,
    nav: [{ tab: 'servers', label: 'Servers', icon: Server, group: 'remote' }],
    blurb: 'Your SSH servers: health, containers, logs.',
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
    background: 'Optional: scheduled cleanup and a low-disk warning from the tray.',
  },
  {
    id: 'claude',
    label: 'Claude Chats',
    group: 'tools',
    icon: Archive,
    nav: [{ tab: 'archiver', label: 'Claude Chats', icon: Archive, group: 'tools' }],
    blurb: 'Browse and archive your Claude Code history.',
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
    background: null,
    optIn: true,
  },
  {
    id: 'projects',
    label: 'Projects',
    group: 'local',
    icon: FolderGit2,
    nav: [{ tab: 'projects', label: 'Projects', icon: FolderGit2, group: 'local' }],
    blurb: 'Git status, workspaces, saved commands, and GitHub PRs.',
    background: null,
  },
  {
    id: 'toolbox',
    label: 'Dev Toolbox',
    group: 'tools',
    icon: Wrench,
    nav: [{ tab: 'toolbox', label: 'Dev Toolbox', icon: Wrench, group: 'tools' }],
    blurb: 'Offline converters, regex tester, cron, hashes & tokens.',
    background: null,
  },
  {
    id: 'domains',
    label: 'Domains & Uptime',
    group: 'remote',
    icon: Globe,
    nav: [{ tab: 'domains', label: 'Domains & Uptime', icon: Globe, group: 'remote' }],
    blurb: 'RDAP expiry, DNS lookup, SSL check & uptime monitoring.',
    background:
      'Optional: checks monitored URLs periodically and alerts on downtime or SSL expiry.',
    optIn: true,
  },
  {
    id: 'secrets',
    label: 'Secrets Scanner',
    group: 'tools',
    icon: ShieldAlert,
    nav: [{ tab: 'secrets', label: 'Secrets Scanner', icon: ShieldAlert, group: 'tools' }],
    blurb: 'Detect committed secrets, unignored .env files & leaked keys.',
    background: null,
    optIn: true,
  },
];

export const moduleById = (id: ModuleId): ModuleDef =>
  MODULES.find((m) => m.id === id) ?? MODULES[0];
