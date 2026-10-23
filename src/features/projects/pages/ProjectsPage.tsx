import { useState } from 'react';
import { FolderGit2, Layers, Play, RefreshCw, Search, Square } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useAppDispatch } from '@/shared/state/hooks';
import { openTerminal } from '@/shared/state/terminalsSlice';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  useProjects,
  useWorkspaces,
  useStartWorkspace,
  useStopWorkspace,
} from '../api/useProjects';
import type { DiscoveredProject } from '../api/projects.schema';
import { ProjectDetail } from '../components/ProjectDetail';
import { WorkspaceModal } from '../components/WorkspaceModal';
import { SavedCommandsModal } from '../components/SavedCommandsModal';

/** `~/Desktop/M0/app` → `M0`: the folder a project sits in, for the list. */
const parentOf = (path: string) => path.split('/').slice(-2, -1)[0] ?? '';

/** Every project on this Mac, and one at a time on the right: run it, see
 * what's missing, fix it — from the app, without a terminal of your own. */
export function ProjectsPage() {
  const { data: projects = [], isLoading, isFetching, error, refetch } = useProjects();
  const { data: workspaces = [] } = useWorkspaces();
  const startWorkspace = useStartWorkspace();
  const stopWorkspace = useStopWorkspace();
  const dispatch = useAppDispatch();

  const [filter, setFilter] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [workspaceFor, setWorkspaceFor] = useState<DiscoveredProject | null>(null);
  const [commandsFor, setCommandsFor] = useState<DiscoveredProject | null>(null);

  const q = filter.trim().toLowerCase();
  const filtered = projects.filter(
    (p) =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.path.toLowerCase().includes(q) ||
      p.framework.toLowerCase().includes(q) ||
      (p.git?.branch.toLowerCase().includes(q) ?? false),
  );
  const selected = projects.find((p) => p.path === selectedPath) ?? filtered[0] ?? null;

  // Saved commands are the user's own shell lines; they run in the project folder.
  const runSaved = (command: string, cwd: string) =>
    dispatch(
      openTerminal({ target: { type: 'workspace', command, projectPath: cwd }, title: command }),
    );

  return (
    <div className="flex h-full overflow-hidden bg-canvas text-fg">
      <nav aria-label="Projects" className="flex w-72 shrink-0 flex-col border-r border-hairline">
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-hairline px-3">
          <span className="text-sm font-semibold text-foreground">
            Projects{' '}
            <span className="font-normal text-muted-foreground tabular-nums">
              {projects.length}
            </span>
          </span>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Rescan projects"
            title="Rescan"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw className={cn(isFetching && 'animate-spin motion-reduce:animate-none')} />
          </Button>
        </div>
        <div className="shrink-0 px-3 py-2">
          <label className="flex h-8 items-center gap-2 rounded-full border border-hairline bg-muted px-3 focus-within:ring-2 focus-within:ring-ring">
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              data-nx-page-search
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Name, folder, framework, branch"
              aria-label="Filter projects"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {error ? (
            <div className="p-2">
              <ErrorPanel
                error={error}
                fallback="Couldn't scan your projects."
                onRetry={() => void refetch()}
              />
            </div>
          ) : isLoading ? (
            <Skeleton lines={10} className="px-2" />
          ) : filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {projects.length === 0
                ? 'No projects found in ~/Desktop, ~/Developer, ~/Projects or ~/Code. A project is a folder with package.json, pom.xml, go.mod, Cargo.toml, pyproject.toml or similar.'
                : 'No project matches.'}
            </p>
          ) : (
            <ul>
              {filtered.map((p) => {
                const active = selected?.path === p.path;
                return (
                  <li key={p.path}>
                    <button
                      type="button"
                      onClick={() => setSelectedPath(p.path)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex w-full cursor-pointer flex-col gap-0.5 rounded-md px-2.5 py-2 text-left',
                        active ? 'bg-accent' : 'hover:bg-accent',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-medium text-foreground">
                          {p.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {p.framework}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="truncate">{parentOf(p.path)}</span>
                        {p.git && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="truncate font-mono">{p.git.branch}</span>
                            {p.git.dirtyCount > 0 && (
                              <span
                                className="size-1.5 shrink-0 rounded-full bg-warning"
                                title={`${p.git.dirtyCount} uncommitted change${p.git.dirtyCount === 1 ? '' : 's'}`}
                              />
                            )}
                          </>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {workspaces.length > 0 && (
          <div className="shrink-0 border-t border-hairline px-3 py-2">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Layers className="size-3.5" aria-hidden />
              Workspaces
            </p>
            {workspaces.map((ws) => (
              <div key={ws.id} className="flex items-center justify-between gap-2 py-0.5 text-xs">
                <span className="truncate text-foreground">{ws.name}</span>
                <span className="flex shrink-0 items-center">
                  <Button
                    variant="ghost"
                    size="iconSm"
                    className="size-6"
                    aria-label={`Start ${ws.name}`}
                    title="Start workspace"
                    onClick={() => startWorkspace.mutate(ws.id)}
                  >
                    <Play className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    className="size-6"
                    aria-label={`Stop ${ws.name}`}
                    title="Stop workspace"
                    onClick={() => stopWorkspace.mutate(ws.id)}
                  >
                    <Square className="size-3" />
                  </Button>
                </span>
              </div>
            ))}
          </div>
        )}
      </nav>

      <main className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <ProjectDetail
            key={selected.path}
            project={selected}
            onOpenWorkspace={setWorkspaceFor}
            onOpenCommands={setCommandsFor}
          />
        ) : (
          !isLoading && (
            <EmptyState
              icon={<FolderGit2 className="size-10" />}
              title="No project selected"
              description="Pick a project to run it, install its dependencies and check what it needs."
            />
          )
        )}
      </main>

      {workspaceFor && (
        <WorkspaceModal project={workspaceFor} onClose={() => setWorkspaceFor(null)} />
      )}
      {commandsFor && (
        <SavedCommandsModal
          project={commandsFor}
          onClose={() => setCommandsFor(null)}
          onRunTerminal={runSaved}
        />
      )}
    </div>
  );
}
