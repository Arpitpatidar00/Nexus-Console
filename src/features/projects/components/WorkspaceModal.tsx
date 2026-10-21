import { useState } from 'react';
import { Layers, Play, Square, X, Plus } from 'lucide-react';
import {
  useWorkspaces,
  useSaveWorkspace,
  useStartWorkspace,
  useStopWorkspace,
} from '../api/useProjects';
import type { DiscoveredProject, WorkspaceConfig } from '../api/projects.schema';

interface WorkspaceModalProps {
  project: DiscoveredProject;
  onClose: () => void;
}

export function WorkspaceModal({ project, onClose }: WorkspaceModalProps) {
  const { data: workspaces = [] } = useWorkspaces();
  const saveWorkspace = useSaveWorkspace();
  const startWorkspace = useStartWorkspace();
  const stopWorkspace = useStopWorkspace();

  const existing = workspaces.find((w) => w.projectPath === project.path);

  const [name, setName] = useState(existing?.name || `${project.name} Workspace`);
  const [brewServices, setBrewServices] = useState<string[]>(existing?.brewServices || []);
  const [newBrew, setNewBrew] = useState('');
  const [composeProjects, setComposeProjects] = useState<string[]>(existing?.composeProjects || []);
  const [newCompose, setNewCompose] = useState('');
  const [openVscode, setOpenVscode] = useState(existing?.openVscode ?? true);

  const [isRunning, setIsRunning] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const config: WorkspaceConfig = {
      id: existing?.id || '',
      name: name.trim(),
      projectPath: project.path,
      brewServices,
      composeProjects,
      tunnels: existing?.tunnels || [],
      openVscode,
      savedCommands: existing?.savedCommands || [],
    };
    saveWorkspace.mutate(config, {
      onSuccess: () => onClose(),
    });
  };

  const handleStart = () => {
    if (!existing) return;
    setIsRunning(true);
    startWorkspace.mutate(existing.id);
  };

  const handleStop = () => {
    if (!existing) return;
    setIsRunning(false);
    stopWorkspace.mutate(existing.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg space-y-4 rounded-xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-info" />
            <h3 className="text-sm font-semibold">Workspace Orchestration</h3>
          </div>
          <button type="button" onClick={onClose} className="text-fg-muted hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div>
            <label htmlFor="ws-name" className="mb-1 block text-fg-muted">
              Workspace Name
            </label>
            <input
              id="ws-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-border bg-muted px-3 py-1.5 text-fg focus:outline-none"
            />
          </div>

          {/* Homebrew Services dependencies */}
          <div className="space-y-1.5">
            <label htmlFor="ws-brew" className="block text-fg-muted">
              Homebrew Services (Auto-started)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="ws-brew"
                type="text"
                placeholder="Formula (e.g. postgresql@16, redis)"
                value={newBrew}
                onChange={(e) => setNewBrew(e.target.value)}
                className="flex-1 rounded border border-border bg-muted px-3 py-1.5 font-mono text-[11px] text-fg focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (newBrew.trim() && !brewServices.includes(newBrew.trim())) {
                    setBrewServices([...brewServices, newBrew.trim()]);
                    setNewBrew('');
                  }
                }}
                className="rounded border border-border bg-muted px-2.5 py-1.5 text-fg hover:bg-canvas"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {brewServices.map((svc) => (
                <span
                  key={svc}
                  className="inline-flex items-center gap-1 rounded bg-info-soft px-2 py-0.5 font-mono text-[11px] text-info"
                >
                  {svc}
                  <button
                    type="button"
                    onClick={() => setBrewServices(brewServices.filter((s) => s !== svc))}
                    className="hover:text-destructive"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Compose Stacks */}
          <div className="space-y-1.5">
            <label htmlFor="ws-compose" className="block text-fg-muted">
              Docker Compose Stacks (Auto-started)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="ws-compose"
                type="text"
                placeholder="Project name (e.g. backend, database)"
                value={newCompose}
                onChange={(e) => setNewCompose(e.target.value)}
                className="flex-1 rounded border border-border bg-muted px-3 py-1.5 font-mono text-[11px] text-fg focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (newCompose.trim() && !composeProjects.includes(newCompose.trim())) {
                    setComposeProjects([...composeProjects, newCompose.trim()]);
                    setNewCompose('');
                  }
                }}
                className="rounded border border-border bg-muted px-2.5 py-1.5 text-fg hover:bg-canvas"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {composeProjects.map((comp) => (
                <span
                  key={comp}
                  className="inline-flex items-center gap-1 rounded bg-info-soft px-2 py-0.5 font-mono text-[11px] text-info"
                >
                  {comp}
                  <button
                    type="button"
                    onClick={() => setComposeProjects(composeProjects.filter((c) => c !== comp))}
                    className="hover:text-destructive"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Checkboxes */}
          <div className="pt-2">
            <label
              htmlFor="ws-vscode"
              className="flex cursor-pointer items-center gap-2 text-fg-muted hover:text-fg"
            >
              <input
                id="ws-vscode"
                type="checkbox"
                checked={openVscode}
                onChange={(e) => setOpenVscode(e.target.checked)}
                className="rounded border-border bg-muted text-info focus:ring-0"
              />
              <span>Open in VS Code on Workspace Launch</span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between border-t border-border pt-3">
            {existing ? (
              <div className="flex items-center gap-2">
                {!isRunning ? (
                  <button
                    type="button"
                    onClick={handleStart}
                    disabled={startWorkspace.isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-success px-3 py-1.5 font-medium text-white transition-colors hover:bg-success/90"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Start Workspace
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStop}
                    disabled={stopWorkspace.isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-warning px-3 py-1.5 font-medium text-white transition-colors hover:bg-warning/90"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    Stop Workspace
                  </button>
                )}
              </div>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3 py-1.5 text-fg-muted hover:text-fg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saveWorkspace.isPending}
                className="rounded-lg bg-info px-4 py-1.5 font-medium text-white transition-colors hover:bg-info"
              >
                Save Setup
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
