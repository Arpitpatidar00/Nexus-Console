import { useState } from 'react';
import { FolderGit2, RefreshCw, Search, Layers, Play, Square } from 'lucide-react';
import {
  useProjects,
  useWorkspaces,
  useStartWorkspace,
  useStopWorkspace,
} from '../api/useProjects';
import { ProjectCard } from '../components/ProjectCard';
import { WorkspaceModal } from '../components/WorkspaceModal';
import { SavedCommandsModal } from '../components/SavedCommandsModal';
import type { DiscoveredProject } from '../api/projects.schema';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';

export function ProjectsPage() {
  const { data: projects = [], isLoading, error, refetch } = useProjects();
  const { data: workspaces = [] } = useWorkspaces();
  const startWorkspace = useStartWorkspace();
  const stopWorkspace = useStopWorkspace();

  const [filter, setFilter] = useState('');
  const [activeWorkspaceProject, setActiveWorkspaceProject] = useState<DiscoveredProject | null>(
    null,
  );
  const [activeCommandsProject, setActiveCommandsProject] = useState<DiscoveredProject | null>(
    null,
  );

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(filter.toLowerCase()) ||
      p.path.toLowerCase().includes(filter.toLowerCase()) ||
      p.framework.toLowerCase().includes(filter.toLowerCase()) ||
      (p.git && p.git.branch.toLowerCase().includes(filter.toLowerCase())),
  );

  const handleRunTerminal = (command: string, cwd: string) => {
    // Open in terminal drawer via clipboard
    void navigator.clipboard.writeText(`cd "${cwd}" && ${command}`);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas text-fg">
      {/* Top Banner */}
      <div className="space-y-4 border-b border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-info-soft text-info">
              <FolderGit2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">Projects & Workspaces</h1>
                <span className="rounded-full border border-info-soft bg-info-soft px-2 py-0.5 text-xs font-medium text-info">
                  {projects.length} detected
                </span>
              </div>
              <p className="mt-0.5 text-xs text-fg-muted">
                Local git status, fullstack workspaces, dependencies, and saved terminal workflows.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute top-2.5 left-2.5 h-3.5 w-3.5 text-fg-muted" />
              <input
                type="text"
                placeholder="Search projects by name, path, branch..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-72 rounded-lg border border-border bg-muted py-1.5 pr-3 pl-8 text-xs text-fg focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-canvas"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Rescan
            </button>
          </div>
        </div>

        {/* Quick Workspaces Bar */}
        {workspaces.length > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-xs">
              <Layers className="h-4 w-4 text-info" />
              <span className="font-semibold text-fg">Configured Workspaces:</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {workspaces.map((ws) => (
                <div
                  key={ws.id}
                  className="flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-xs"
                >
                  <span className="font-medium">{ws.name}</span>
                  <button
                    type="button"
                    title="Start workspace"
                    onClick={() => startWorkspace.mutate(ws.id)}
                    className="p-1 text-muted-foreground transition-colors hover:text-success"
                  >
                    <Play className="h-3 w-3 fill-current" />
                  </button>
                  <button
                    type="button"
                    title="Stop workspace"
                    onClick={() => stopWorkspace.mutate(ws.id)}
                    className="p-1 text-muted-foreground transition-colors hover:text-warning"
                  >
                    <Square className="h-3 w-3 fill-current" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Projects Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {error ? (
          <ErrorPanel
            error={error}
            fallback="Couldn't scan your projects."
            onRetry={() => void refetch()}
          />
        ) : isLoading ? (
          <div className="flex items-center justify-center py-24 text-xs text-fg-muted">
            Discovering git projects under configured roots...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center space-y-3 py-24 text-center">
            <FolderGit2 className="h-12 w-12 text-muted-foreground" />
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-fg">No Projects Found</h3>
              <p className="max-w-sm text-xs text-fg-muted">
                No git projects with manifest files found under your project roots. Configure
                project roots in Settings → Mac Clean.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((proj) => (
              <ProjectCard
                key={proj.path}
                project={proj}
                onOpenWorkspace={(p) => setActiveWorkspaceProject(p)}
                onOpenCommands={(p) => setActiveCommandsProject(p)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {activeWorkspaceProject && (
        <WorkspaceModal
          project={activeWorkspaceProject}
          onClose={() => setActiveWorkspaceProject(null)}
        />
      )}

      {activeCommandsProject && (
        <SavedCommandsModal
          project={activeCommandsProject}
          onClose={() => setActiveCommandsProject(null)}
          onRunTerminal={handleRunTerminal}
        />
      )}
    </div>
  );
}
