import { useState } from 'react';
import { Terminal, Plus, Trash2, Play, X } from 'lucide-react';
import { useSavedCommands, useSaveCommand, useDeleteCommand } from '../api/useProjects';
import type { DiscoveredProject } from '../api/projects.schema';

interface SavedCommandsModalProps {
  project: DiscoveredProject;
  onClose: () => void;
  onRunTerminal: (command: string, cwd: string) => void;
}

export function SavedCommandsModal({ project, onClose, onRunTerminal }: SavedCommandsModalProps) {
  const { data: commands = [], isLoading } = useSavedCommands(project.path);
  const saveCommand = useSaveCommand();
  const deleteCommand = useDeleteCommand();

  const [newName, setNewName] = useState('');
  const [newCmd, setNewCmd] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newCmd.trim()) return;
    saveCommand.mutate(
      {
        id: '',
        projectPath: project.path,
        name: newName.trim(),
        command: newCmd.trim(),
      },
      {
        onSuccess: () => {
          setNewName('');
          setNewCmd('');
          setIsAdding(false);
        },
      },
    );
  };

  const handleRun = (cmdString: string) => {
    onRunTerminal(cmdString, project.path);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg space-y-4 rounded-xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-info" />
            <h3 className="text-sm font-semibold">Saved Commands — {project.name}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-fg-muted hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Action Button: New Command */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-fg-muted">
            Execute author-defined terminal workflows in the interactive terminal drawer.
          </p>
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 rounded-lg bg-info px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-info"
          >
            <Plus className="h-3.5 w-3.5" />
            New Command
          </button>
        </div>

        {/* Add Form */}
        {isAdding && (
          <form
            onSubmit={handleAdd}
            className="space-y-2.5 rounded-lg border border-border bg-muted p-3 text-xs"
          >
            <div>
              <label htmlFor="cmd-label" className="mb-1 block text-fg-muted">
                Command Name
              </label>
              <input
                id="cmd-label"
                type="text"
                required
                placeholder="e.g. Run Tests, Lint Code"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded border border-border bg-card px-2.5 py-1.5 text-fg focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="cmd-str" className="mb-1 block text-fg-muted">
                Shell Command Line
              </label>
              <input
                id="cmd-str"
                type="text"
                required
                placeholder="e.g. npm test, cargo check"
                value={newCmd}
                onChange={(e) => setNewCmd(e.target.value)}
                className="w-full rounded border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] text-fg focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="rounded px-2.5 py-1 text-fg-muted hover:text-fg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saveCommand.isPending}
                className="rounded bg-info px-3 py-1 font-medium text-white transition-colors hover:bg-info"
              >
                Save
              </button>
            </div>
          </form>
        )}

        {/* Commands List */}
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {isLoading ? (
            <div className="p-4 text-center text-xs text-fg-muted">Loading commands...</div>
          ) : commands.length === 0 ? (
            <div className="p-6 text-center text-xs text-fg-muted">
              No saved commands for this project. Author frequently used commands above.
            </div>
          ) : (
            commands.map((cmd) => (
              <div
                key={cmd.id}
                className="flex items-center justify-between p-3 px-4 transition-colors hover:bg-muted/30"
              >
                <div className="max-w-[300px] space-y-0.5 truncate">
                  <div className="truncate text-xs font-semibold text-fg">{cmd.name}</div>
                  <div className="truncate font-mono text-[11px] text-fg-muted">{cmd.command}</div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleRun(cmd.command)}
                    className="flex items-center gap-1 rounded bg-success-soft px-2.5 py-1 text-xs font-medium text-success transition-colors hover:bg-success-soft"
                  >
                    <Play className="h-3 w-3 fill-current" /> Run
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCommand.mutate({ id: cmd.id, projectPath: project.path })}
                    className="p-1 text-muted-foreground transition-colors hover:text-destructive"
                    title="Delete command"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
