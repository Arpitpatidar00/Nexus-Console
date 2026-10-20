import { lazy, type ComponentType } from 'react';
import type { Tab } from '@/shared/state/uiSlice';

// Lazy pages. Deep-importing directly from each page directory ensures optimal
// code-splitting and prevents cross-tab bundle chaining through feature barrels.
// `.then(m => ({ default }))` satisfies React.lazy's default-import contract
// while preserving strict named exports across the codebase.
export const PAGES: Record<Tab, ComponentType> = {
  services: lazy(() =>
    import('@/features/services/pages/ServicesPage').then((m) => ({ default: m.ServicesPage })),
  ),
  packages: lazy(() =>
    import('@/features/packages/pages/PackagesPage').then((m) => ({ default: m.PackagesPage })),
  ),
  storage: lazy(() =>
    import('@/features/maclean/pages/StoragePage').then((m) => ({ default: m.StoragePage })),
  ),
  memory: lazy(() =>
    import('@/features/maclean/pages/MemoryPage').then((m) => ({ default: m.MemoryPage })),
  ),
  energy: lazy(() =>
    import('@/features/maclean/pages/EnergyPage').then((m) => ({ default: m.EnergyPage })),
  ),
  servers: lazy(() =>
    import('@/features/remote/pages/RemotePage').then((m) => ({ default: m.RemotePage })),
  ),
  ports: lazy(() =>
    import('@/features/ports/pages/PortsPage').then((m) => ({ default: m.PortsPage })),
  ),
  sessions: lazy(() =>
    import('@/features/sessions/pages/SessionsPage').then((m) => ({ default: m.SessionsPage })),
  ),
  doctor: lazy(() =>
    import('@/features/doctor/pages/DoctorPage').then((m) => ({ default: m.DoctorPage })),
  ),
  archiver: lazy(() =>
    import('@/features/archiver/pages/ArchiverPage').then((m) => ({ default: m.ArchiverPage })),
  ),
  docker: lazy(() =>
    import('@/features/docker/pages/DockerPage').then((m) => ({ default: m.DockerPage })),
  ),
  databases: lazy(() =>
    import('@/features/databases/pages/DatabasesPage').then((m) => ({ default: m.DatabasesPage })),
  ),
  projects: lazy(() =>
    import('@/features/projects/pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage })),
  ),
  toolbox: lazy(() =>
    import('@/features/toolbox/pages/ToolboxPage').then((m) => ({ default: m.ToolboxPage })),
  ),
  domains: lazy(() =>
    import('@/features/domains/pages/DomainsPage').then((m) => ({ default: m.DomainsPage })),
  ),
  secrets: lazy(() =>
    import('@/features/secrets/pages/SecretsPage').then((m) => ({ default: m.SecretsPage })),
  ),
  cloud: lazy(() =>
    import('@/features/cloud/pages/CloudPage').then((m) => ({ default: m.CloudPage })),
  ),
  backups: lazy(() =>
    import('@/features/backups/pages/BackupsPage').then((m) => ({ default: m.BackupsPage })),
  ),
  network: lazy(() =>
    import('@/features/network/pages/NetworkPage').then((m) => ({ default: m.NetworkPage })),
  ),
  settings: lazy(() =>
    import('@/features/settings/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
  ),
};
