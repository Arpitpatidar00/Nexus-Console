import { useState } from 'react';
import {
  Container as ContainerIcon,
  Layers,
  Play,
  Square,
  RotateCw,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  useDockerRuntime,
  useDockerContainers,
  useDockerContainerAction,
  useDockerComposeAction,
} from '../api/useDocker';
import type { LocalContainer } from '../api/docker.schema';

export function DockerPage() {
  const { data: runtime, isLoading: isRuntimeLoading } = useDockerRuntime();
  const { data: containers = [], isLoading: isContainersLoading } = useDockerContainers(
    runtime?.running ?? false,
  );
  const containerAction = useDockerContainerAction();
  const composeAction = useDockerComposeAction();

  const [activeTab, setActiveTab] = useState<'containers' | 'stacks'>('containers');
  const [filter, setFilter] = useState('');

  const filtered = containers.filter(
    (c) =>
      c.name.toLowerCase().includes(filter.toLowerCase()) ||
      c.image.toLowerCase().includes(filter.toLowerCase()) ||
      (c.composeProject && c.composeProject.toLowerCase().includes(filter.toLowerCase())),
  );

  // Group by compose project
  const stacks: Record<string, LocalContainer[]> = {};
  for (const c of containers) {
    const project = c.composeProject || 'Standalone Containers';
    if (!stacks[project]) {
      stacks[project] = [];
    }
    stacks[project].push(c);
  }

  return (
    <div className="bg-surface-base text-text-primary flex h-full flex-col overflow-hidden">
      {/* Top Banner / Engine status */}
      <div className="border-border-subtle bg-surface-elevated flex items-center justify-between border-b p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
            <ContainerIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">Docker & Containers</h1>
              {runtime?.running ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  {runtime.runtime} Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-500/20 bg-zinc-500/10 px-2 py-0.5 text-xs font-medium text-zinc-400">
                  <AlertCircle className="h-3 w-3" />
                  Daemon Offline
                </span>
              )}
            </div>
            <p className="text-text-muted mt-0.5 text-xs">
              {runtime?.running
                ? `${runtime.runtime} (v${runtime.version ?? 'unknown'}) • ${runtime.containerCount} containers running`
                : 'No active container daemon detected. Launch Docker Desktop, OrbStack, or Colima.'}
            </p>
          </div>
        </div>

        {/* View Toggle Tabs */}
        <div className="bg-surface-subtle border-border-subtle flex items-center gap-1 rounded-lg border p-1">
          <button
            type="button"
            onClick={() => setActiveTab('containers')}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'containers'
                ? 'bg-surface-elevated text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <ContainerIcon className="h-3.5 w-3.5" />
            Containers ({containers.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('stacks')}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'stacks'
                ? 'bg-surface-elevated text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Compose Stacks ({Object.keys(stacks).length})
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {/* Search bar */}
        <div className="flex items-center justify-between">
          <input
            type="text"
            placeholder="Search containers by name, image, or stack..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-surface-subtle border-border-subtle text-text-primary w-80 rounded-md border px-3 py-1.5 text-xs focus:border-blue-500/50 focus:outline-none"
          />
        </div>

        {isRuntimeLoading || isContainersLoading ? (
          <div className="text-text-muted flex items-center justify-center py-24 text-xs">
            Scanning local container runtime...
          </div>
        ) : !runtime?.running ? (
          <div className="flex flex-col items-center justify-center space-y-3 py-20 text-center">
            <ContainerIcon className="h-12 w-12 text-zinc-600" />
            <div className="space-y-1">
              <h3 className="text-text-primary text-sm font-medium">
                Container Daemon Not Running
              </h3>
              <p className="text-text-muted max-w-sm text-xs">
                Start OrbStack, Docker Desktop, or Colima to inspect and manage local containers and
                compose stacks.
              </p>
            </div>
          </div>
        ) : activeTab === 'containers' ? (
          /* Containers Table View */
          <div className="border-border-subtle bg-surface-elevated overflow-hidden rounded-xl border">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-subtle border-border-subtle text-text-muted border-b font-medium">
                <tr>
                  <th className="px-4 py-2.5">Container</th>
                  <th className="px-4 py-2.5">Image</th>
                  <th className="px-4 py-2.5">State</th>
                  <th className="px-4 py-2.5">Ports</th>
                  <th className="px-4 py-2.5">Project</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-border-subtle divide-y">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-text-muted py-8 text-center">
                      No containers matching search filter.
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => {
                    const isRunning = c.state === 'running';
                    return (
                      <tr key={c.id} className="hover:bg-surface-subtle/50 transition-colors">
                        <td className="text-text-primary flex items-center gap-2 px-4 py-3 font-mono font-medium">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              isRunning ? 'bg-emerald-400' : 'bg-zinc-500'
                            }`}
                          />
                          {c.name}
                        </td>
                        <td
                          className="text-text-muted max-w-[200px] truncate px-4 py-3 font-mono"
                          title={c.image}
                        >
                          {c.image}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium ${
                              isRunning
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-zinc-500/10 text-zinc-400'
                            }`}
                          >
                            {c.health === 'healthy' && <CheckCircle2 className="h-2.5 w-2.5" />}
                            {c.status}
                          </span>
                        </td>
                        <td
                          className="text-text-muted max-w-[150px] truncate px-4 py-3 font-mono"
                          title={c.ports}
                        >
                          {c.ports || '—'}
                        </td>
                        <td className="text-text-muted px-4 py-3">
                          {c.composeProject ? (
                            <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400">
                              {c.composeProject}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isRunning ? (
                              <button
                                type="button"
                                title="Stop container"
                                onClick={() =>
                                  containerAction.mutate({ name: c.name, action: 'stop' })
                                }
                                className="hover:bg-surface-subtle text-text-muted rounded p-1 transition-colors hover:text-amber-400"
                              >
                                <Square className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                title="Start container"
                                onClick={() =>
                                  containerAction.mutate({ name: c.name, action: 'start' })
                                }
                                className="hover:bg-surface-subtle text-text-muted rounded p-1 transition-colors hover:text-emerald-400"
                              >
                                <Play className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              title="Restart container"
                              onClick={() =>
                                containerAction.mutate({ name: c.name, action: 'restart' })
                              }
                              className="hover:bg-surface-subtle text-text-muted hover:text-text-primary rounded p-1 transition-colors"
                            >
                              <RotateCw className="h-3.5 w-3.5" />
                            </button>
                            {!isRunning && (
                              <button
                                type="button"
                                title="Remove container"
                                onClick={() =>
                                  containerAction.mutate({ name: c.name, action: 'remove' })
                                }
                                className="hover:bg-surface-subtle text-text-muted rounded p-1 transition-colors hover:text-red-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* Stacks View */
          <div className="space-y-4">
            {Object.entries(stacks).map(([projectName, stackContainers]) => {
              return (
                <div
                  key={projectName}
                  className="border-border-subtle bg-surface-elevated overflow-hidden rounded-xl border"
                >
                  <div className="bg-surface-subtle/50 border-border-subtle flex items-center justify-between border-b p-4">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-blue-400" />
                      <span className="text-sm font-semibold">{projectName}</span>
                      <span className="text-text-muted text-xs">
                        ({stackContainers.length} services)
                      </span>
                    </div>

                    {projectName !== 'Standalone Containers' && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            composeAction.mutate({ project: projectName, action: 'start' })
                          }
                          className="flex items-center gap-1 rounded bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
                        >
                          <Play className="h-3 w-3" /> Start All
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            composeAction.mutate({ project: projectName, action: 'restart' })
                          }
                          className="text-text-muted hover:text-text-primary flex items-center gap-1 rounded bg-zinc-500/10 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-zinc-500/20"
                        >
                          <RotateCw className="h-3 w-3" /> Restart All
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            composeAction.mutate({ project: projectName, action: 'stop' })
                          }
                          className="flex items-center gap-1 rounded bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
                        >
                          <Square className="h-3 w-3" /> Stop All
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="divide-border-subtle divide-y">
                    {stackContainers.map((c) => (
                      <div
                        key={c.id}
                        className="hover:bg-surface-subtle/30 flex items-center justify-between p-3 px-4 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              c.state === 'running' ? 'bg-emerald-400' : 'bg-zinc-500'
                            }`}
                          />
                          <span className="font-mono font-medium">{c.name}</span>
                          <span className="text-text-muted font-mono text-[11px]">{c.image}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-text-muted font-mono">{c.ports || '—'}</span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              c.state === 'running'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-zinc-500/10 text-zinc-400'
                            }`}
                          >
                            {c.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
