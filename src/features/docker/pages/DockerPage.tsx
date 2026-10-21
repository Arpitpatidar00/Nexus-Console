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
    <div className="flex h-full flex-col overflow-hidden bg-canvas text-fg">
      {/* Top Banner / Engine status */}
      <div className="flex items-center justify-between border-b border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-info-soft text-info">
            <ContainerIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">Docker & Containers</h1>
              {runtime?.running ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success-soft bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                  {runtime.runtime} Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-muted bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  <AlertCircle className="h-3 w-3" />
                  Daemon Offline
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-fg-muted">
              {runtime?.running
                ? `${runtime.runtime} (v${runtime.version ?? 'unknown'}) • ${runtime.containerCount} containers running`
                : 'No active container daemon detected. Launch Docker Desktop, OrbStack, or Colima.'}
            </p>
          </div>
        </div>

        {/* View Toggle Tabs */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted p-1">
          <button
            type="button"
            onClick={() => setActiveTab('containers')}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'containers'
                ? 'bg-card text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            <ContainerIcon className="h-3.5 w-3.5" />
            Containers ({containers.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('stacks')}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'stacks' ? 'bg-card text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
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
            className="w-80 rounded-md border border-border bg-muted px-3 py-1.5 text-xs text-fg focus:border-info-soft focus:outline-none"
          />
        </div>

        {isRuntimeLoading || isContainersLoading ? (
          <div className="flex items-center justify-center py-24 text-xs text-fg-muted">
            Scanning local container runtime...
          </div>
        ) : !runtime?.running ? (
          <div className="flex flex-col items-center justify-center space-y-3 py-20 text-center">
            <ContainerIcon className="h-12 w-12 text-muted-foreground" />
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-fg">Container Daemon Not Running</h3>
              <p className="max-w-sm text-xs text-fg-muted">
                Start OrbStack, Docker Desktop, or Colima to inspect and manage local containers and
                compose stacks.
              </p>
            </div>
          </div>
        ) : activeTab === 'containers' ? (
          /* Containers Table View */
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted font-medium text-fg-muted">
                <tr>
                  <th className="px-4 py-2.5">Container</th>
                  <th className="px-4 py-2.5">Image</th>
                  <th className="px-4 py-2.5">State</th>
                  <th className="px-4 py-2.5">Ports</th>
                  <th className="px-4 py-2.5">Project</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-fg-muted">
                      No containers matching search filter.
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => {
                    const isRunning = c.state === 'running';
                    return (
                      <tr key={c.id} className="transition-colors hover:bg-muted/50">
                        <td className="flex items-center gap-2 px-4 py-3 font-mono font-medium text-fg">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              isRunning ? 'bg-success' : 'bg-muted-foreground'
                            }`}
                          />
                          {c.name}
                        </td>
                        <td
                          className="max-w-[200px] truncate px-4 py-3 font-mono text-fg-muted"
                          title={c.image}
                        >
                          {c.image}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium ${
                              isRunning
                                ? 'bg-success-soft text-success'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {c.health === 'healthy' && <CheckCircle2 className="h-2.5 w-2.5" />}
                            {c.status}
                          </span>
                        </td>
                        <td
                          className="max-w-[150px] truncate px-4 py-3 font-mono text-fg-muted"
                          title={c.ports}
                        >
                          {c.ports || '—'}
                        </td>
                        <td className="px-4 py-3 text-fg-muted">
                          {c.composeProject ? (
                            <span className="rounded bg-info-soft px-1.5 py-0.5 text-[10px] text-info">
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
                                className="rounded p-1 text-fg-muted transition-colors hover:bg-muted hover:text-warning"
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
                                className="rounded p-1 text-fg-muted transition-colors hover:bg-muted hover:text-success"
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
                              className="rounded p-1 text-fg-muted transition-colors hover:bg-muted hover:text-fg"
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
                                className="rounded p-1 text-fg-muted transition-colors hover:bg-muted hover:text-destructive"
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
                  className="overflow-hidden rounded-xl border border-border bg-card"
                >
                  <div className="flex items-center justify-between border-b border-border bg-muted/50 p-4">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-info" />
                      <span className="text-sm font-semibold">{projectName}</span>
                      <span className="text-xs text-fg-muted">
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
                          className="flex items-center gap-1 rounded bg-success-soft px-2.5 py-1 text-xs font-medium text-success transition-colors hover:bg-success-soft"
                        >
                          <Play className="h-3 w-3" /> Start All
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            composeAction.mutate({ project: projectName, action: 'restart' })
                          }
                          className="flex items-center gap-1 rounded bg-muted px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-muted hover:text-fg"
                        >
                          <RotateCw className="h-3 w-3" /> Restart All
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            composeAction.mutate({ project: projectName, action: 'stop' })
                          }
                          className="flex items-center gap-1 rounded bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning transition-colors hover:bg-warning-soft"
                        >
                          <Square className="h-3 w-3" /> Stop All
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="divide-y divide-border">
                    {stackContainers.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between p-3 px-4 text-xs hover:bg-muted/30"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              c.state === 'running' ? 'bg-success' : 'bg-muted-foreground'
                            }`}
                          />
                          <span className="font-mono font-medium">{c.name}</span>
                          <span className="font-mono text-[11px] text-fg-muted">{c.image}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-fg-muted">{c.ports || '—'}</span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              c.state === 'running'
                                ? 'bg-success-soft text-success'
                                : 'bg-muted text-muted-foreground'
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
