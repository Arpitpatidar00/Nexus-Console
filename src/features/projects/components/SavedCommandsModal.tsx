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
      <div className="bg-surface-elevated border-border-subtle w-full max-w-lg space-y-4 rounded-xl border p-5 shadow-2xl">
        <div className="border-border-subtle flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-semibold">Saved Commands — {project.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Action Button: New Command */}
        <div className="flex items-center justify-between">
          <p className="text-text-muted text-xs">
            Execute author-defined terminal workflows in the interactive terminal drawer.
          </p>
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-500"
          >
            <Plus className="h-3.5 w-3.5" />
            New Command
          </button>
        </div>

        {/* Add Form */}
        {isAdding && (
          <form
            onSubmit={handleAdd}
            className="bg-surface-subtle border-border-subtle space-y-2.5 rounded-lg border p-3 text-xs"
          >
            <div>
              <label htmlFor="cmd-label" className="text-text-muted mb-1 block">
                Command Name
              </label>
              <input
                id="cmd-label"
                type="text"
                required
                placeholder="e.g. Run Tests, Lint Code"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="bg-surface-elevated border-border-subtle text-text-primary w-full rounded border px-2.5 py-1.5 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="cmd-str" className="text-text-muted mb-1 block">
                Shell Command Line
              </label>
              <input
                id="cmd-str"
                type="text"
                required
                placeholder="e.g. npm test, cargo check"
                value={newCmd}
                onChange={(e) => setNewCmd(e.target.value)}
                className="bg-surface-elevated border-border-subtle text-text-primary w-full rounded border px-2.5 py-1.5 font-mono text-[11px] focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="text-text-muted hover:text-text-primary rounded px-2.5 py-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saveCommand.isPending}
                className="rounded bg-blue-600 px-3 py-1 font-medium text-white transition-colors hover:bg-blue-500"
              >
                Save
              </button>
            </div>
          </form>
        )}

        {/* Commands List */}
        <div className="border-border-subtle bg-surface-elevated divide-border-subtle divide-y overflow-hidden rounded-lg border">
          {isLoading ? (
            <div className="text-text-muted p-4 text-center text-xs">Loading commands...</div>
          ) : commands.length === 0 ? (
            <div className="text-text-muted p-6 text-center text-xs">
              No saved commands for this project. Author frequently used commands above.
            </div>
          ) : (
            commands.map((cmd) => (
              <div
                key={cmd.id}
                className="hover:bg-surface-subtle/30 flex items-center justify-between p-3 px-4 transition-colors"
              >
                <div className="max-w-[300px] space-y-0.5 truncate">
                  <div className="text-text-primary truncate text-xs font-semibold">{cmd.name}</div>
                  <div className="text-text-muted truncate font-mono text-[11px]">
                    {cmd.command}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleRun(cmd.command)}
                    className="flex items-center gap-1 rounded bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
                  >
                    <Play className="h-3 w-3 fill-current" /> Run
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCommand.mutate({ id: cmd.id, projectPath: project.path })}
                    className="p-1 text-zinc-500 transition-colors hover:text-red-400"
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
