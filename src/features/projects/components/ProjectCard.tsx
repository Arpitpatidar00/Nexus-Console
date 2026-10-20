import { useState } from 'react';
import {
  FolderGit2,
  GitBranch,
  RefreshCw,
  Terminal,
  Trash2,
  Play,
  Layers,
  ChevronDown,
  ExternalLink,
  GitPullRequest,
} from 'lucide-react';
import { useGitFetch, useDeleteMergedBranches, useGitHubStatus } from '../api/useProjects';
import type { DiscoveredProject } from '../api/projects.schema';

interface ProjectCardProps {
  project: DiscoveredProject;
  onOpenWorkspace: (project: DiscoveredProject) => void;
  onOpenCommands: (project: DiscoveredProject) => void;
}

export function ProjectCard({ project, onOpenWorkspace, onOpenCommands }: ProjectCardProps) {
  const gitFetch = useGitFetch();
  const deleteMerged = useDeleteMergedBranches();
  const [showGh, setShowGh] = useState(false);
  const { data: ghStatus } = useGitHubStatus(showGh ? project.path : null);

  const git = project.git;

  const handleFetch = (e: React.MouseEvent) => {
    e.stopPropagation();
    gitFetch.mutate(project.path);
  };

  const handleDeleteMerged = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!git?.mergedBranches.length) return;
    if (
      confirm(
        `Delete ${git.mergedBranches.length} merged branch(es)?\n\n${git.mergedBranches.join(', ')}`,
      )
    ) {
      deleteMerged.mutate({ path: project.path, branches: git.mergedBranches });
    }
  };

  return (
    <div className="border-border-subtle bg-surface-elevated hover:border-border-muted flex flex-col justify-between space-y-3 rounded-xl border p-4 transition-all">
      <div className="space-y-2">
        {/* Top: Name & Framework */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
              <FolderGit2 className="h-4 w-4" />
            </div>
            <div>
              <h3
                className="text-text-primary max-w-[200px] truncate text-sm leading-none font-semibold tracking-tight"
                title={project.name}
              >
                {project.name}
              </h3>
              <p
                className="text-text-muted mt-1 max-w-[220px] truncate font-mono text-[10px]"
                title={project.path}
              >
                {project.path}
              </p>
            </div>
          </div>
          <span className="bg-surface-subtle text-text-muted border-border-subtle rounded border px-2 py-0.5 text-[10px] font-medium">
            {project.framework}
          </span>
        </div>

        {/* Git Info */}
        {git ? (
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-blue-400">
                <GitBranch className="h-3 w-3" />
                {git.branch}
              </span>

              {git.dirtyCount > 0 ? (
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-400">
                  {git.dirtyCount} modified
                </span>
              ) : (
                <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
                  clean
                </span>
              )}

              {git.ahead > 0 && (
                <span className="rounded bg-purple-500/10 px-1.5 py-0.5 font-mono text-[10px] text-purple-400">
                  ↑{git.ahead}
                </span>
              )}
              {git.behind > 0 && (
                <span className="rounded bg-orange-500/10 px-1.5 py-0.5 font-mono text-[10px] text-orange-400">
                  ↓{git.behind}
                </span>
              )}
              {git.stashCount > 0 && (
                <span className="rounded bg-zinc-500/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                  {git.stashCount} stashes
                </span>
              )}
            </div>

            {/* Last Commit */}
            {git.lastCommit && (
              <div className="bg-surface-subtle border-border-subtle space-y-0.5 rounded-lg border p-2 text-[11px]">
                <div
                  className="text-text-primary truncate font-mono"
                  title={git.lastCommit.message}
                >
                  {git.lastCommit.hash} {git.lastCommit.message}
                </div>
                <div className="text-text-muted text-[10px]">
                  {git.lastCommit.author} • {git.lastCommit.relativeTime}
                </div>
              </div>
            )}

            {/* Merged branches alert */}
            {git.mergedBranches.length > 0 && (
              <div className="border-border-subtle flex items-center justify-between rounded border bg-zinc-500/10 px-2 py-1 text-[11px]">
                <span className="text-text-muted">
                  {git.mergedBranches.length} merged branch(es)
                </span>
                <button
                  type="button"
                  onClick={handleDeleteMerged}
                  disabled={deleteMerged.isPending}
                  className="flex items-center gap-1 text-[10px] font-medium text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-2.5 w-2.5" /> Prune
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-text-muted py-2 text-xs">Non-git project or git unavailable.</div>
        )}

        {/* GitHub Expandable PRs */}
        <div>
          <button
            type="button"
            onClick={() => setShowGh(!showGh)}
            className="text-text-muted hover:text-text-primary flex items-center gap-1 py-1 text-[11px] transition-colors"
          >
            <GitPullRequest className="h-3 w-3" />
            <span>GitHub PRs & CI</span>
            <ChevronDown className={`h-3 w-3 transition-transform ${showGh ? 'rotate-180' : ''}`} />
          </button>

          {showGh && (
            <div className="bg-surface-subtle border-border-subtle mt-1 space-y-1 rounded border p-2 text-xs">
              {!ghStatus?.ghInstalled ? (
                <div className="text-text-muted text-[11px]">
                  Install GitHub CLI (`gh`) to view PRs.
                </div>
              ) : !ghStatus.loggedIn ? (
                <div className="text-text-muted text-[11px]">
                  Run `gh auth login` to connect GitHub.
                </div>
              ) : ghStatus.pullRequests.length === 0 ? (
                <div className="text-text-muted text-[11px]">No open pull requests.</div>
              ) : (
                ghStatus.pullRequests.map((pr) => (
                  <div key={pr.number} className="flex items-center justify-between py-0.5">
                    <span className="max-w-[180px] truncate text-[11px]" title={pr.title}>
                      #{pr.number} {pr.title}
                    </span>
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-0.5 text-blue-400 hover:text-blue-300"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer Quick Actions */}
      <div className="border-border-subtle flex items-center justify-between gap-1 border-t pt-2 text-xs">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleFetch}
            disabled={gitFetch.isPending}
            title="Git fetch"
            className="hover:bg-surface-subtle text-text-muted hover:text-text-primary rounded p-1.5 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${gitFetch.isPending ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => onOpenCommands(project)}
            title="Saved Commands"
            className="hover:bg-surface-subtle text-text-muted hover:text-text-primary flex items-center gap-1 rounded p-1.5 transition-colors"
          >
            <Terminal className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onOpenWorkspace(project)}
            title="Workspace Setup"
            className="hover:bg-surface-subtle text-text-muted hover:text-text-primary flex items-center gap-1 rounded p-1.5 transition-colors"
          >
            <Layers className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onOpenWorkspace(project)}
          className="flex items-center gap-1 rounded bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/20"
        >
          <Play className="h-3 w-3 fill-current" />
          Workspace
        </button>
      </div>
    </div>
  );
}
