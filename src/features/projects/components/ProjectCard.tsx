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
    deleteMerged.mutate({ path: project.path, branches: git.mergedBranches });
  };

  return (
    <div className="flex flex-col justify-between space-y-3 rounded-xl border border-border bg-card p-4 transition-all hover:border-border">
      <div className="space-y-2">
        {/* Top: Name & Framework */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
              <FolderGit2 className="h-4 w-4" />
            </div>
            <div>
              <h3
                className="max-w-[200px] truncate text-sm leading-none font-semibold tracking-tight text-fg"
                title={project.name}
              >
                {project.name}
              </h3>
              <p
                className="mt-1 max-w-[220px] truncate font-mono text-[10px] text-fg-muted"
                title={project.path}
              >
                {project.path}
              </p>
            </div>
          </div>
          <span className="rounded border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-fg-muted">
            {project.framework}
          </span>
        </div>

        {/* Git Info */}
        {git ? (
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="inline-flex items-center gap-1 rounded bg-info-soft px-2 py-0.5 font-mono text-[11px] font-medium text-info">
                <GitBranch className="h-3 w-3" />
                {git.branch}
              </span>

              {git.dirtyCount > 0 ? (
                <span className="rounded bg-warning-soft px-1.5 py-0.5 font-mono text-[10px] text-warning">
                  {git.dirtyCount} modified
                </span>
              ) : (
                <span className="rounded bg-success-soft px-1.5 py-0.5 font-mono text-[10px] text-success">
                  clean
                </span>
              )}

              {git.ahead > 0 && (
                <span className="rounded bg-info-soft px-1.5 py-0.5 font-mono text-[10px] text-info">
                  ↑{git.ahead}
                </span>
              )}
              {git.behind > 0 && (
                <span className="rounded bg-ember-soft px-1.5 py-0.5 font-mono text-[10px] text-ember">
                  ↓{git.behind}
                </span>
              )}
              {git.stashCount > 0 && (
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {git.stashCount} stashes
                </span>
              )}
            </div>

            {/* Last Commit */}
            {git.lastCommit && (
              <div className="space-y-0.5 rounded-lg border border-border bg-muted p-2 text-[11px]">
                <div className="truncate font-mono text-fg" title={git.lastCommit.message}>
                  {git.lastCommit.hash} {git.lastCommit.message}
                </div>
                <div className="text-[10px] text-fg-muted">
                  {git.lastCommit.author} • {git.lastCommit.relativeTime}
                </div>
              </div>
            )}

            {/* Merged branches alert */}
            {git.mergedBranches.length > 0 && (
              <div className="flex items-center justify-between rounded border border-border bg-muted px-2 py-1 text-[11px]">
                <span className="text-fg-muted">{git.mergedBranches.length} merged branch(es)</span>
                <button
                  type="button"
                  onClick={handleDeleteMerged}
                  disabled={deleteMerged.isPending}
                  className="flex items-center gap-1 text-[10px] font-medium text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-2.5 w-2.5" /> Prune
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="py-2 text-xs text-fg-muted">Non-git project or git unavailable.</div>
        )}

        {/* GitHub Expandable PRs */}
        <div>
          <button
            type="button"
            onClick={() => setShowGh(!showGh)}
            className="flex items-center gap-1 py-1 text-[11px] text-fg-muted transition-colors hover:text-fg"
          >
            <GitPullRequest className="h-3 w-3" />
            <span>GitHub PRs & CI</span>
            <ChevronDown className={`h-3 w-3 transition-transform ${showGh ? 'rotate-180' : ''}`} />
          </button>

          {showGh && (
            <div className="mt-1 space-y-1 rounded border border-border bg-muted p-2 text-xs">
              {!ghStatus?.ghInstalled ? (
                <div className="text-[11px] text-fg-muted">
                  Install GitHub CLI (`gh`) to view PRs.
                </div>
              ) : !ghStatus.loggedIn ? (
                <div className="text-[11px] text-fg-muted">
                  Run `gh auth login` to connect GitHub.
                </div>
              ) : ghStatus.pullRequests.length === 0 ? (
                <div className="text-[11px] text-fg-muted">No open pull requests.</div>
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
                      className="p-0.5 text-info hover:text-info"
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
      <div className="flex items-center justify-between gap-1 border-t border-border pt-2 text-xs">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleFetch}
            disabled={gitFetch.isPending}
            title="Git fetch"
            className="rounded p-1.5 text-fg-muted transition-colors hover:bg-muted hover:text-fg"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${gitFetch.isPending ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => onOpenCommands(project)}
            title="Saved Commands"
            className="flex items-center gap-1 rounded p-1.5 text-fg-muted transition-colors hover:bg-muted hover:text-fg"
          >
            <Terminal className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onOpenWorkspace(project)}
            title="Workspace Setup"
            className="flex items-center gap-1 rounded p-1.5 text-fg-muted transition-colors hover:bg-muted hover:text-fg"
          >
            <Layers className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onOpenWorkspace(project)}
          className="flex items-center gap-1 rounded bg-info-soft px-2.5 py-1 text-xs font-medium text-info transition-colors hover:bg-info-soft"
        >
          <Play className="h-3 w-3 fill-current" />
          Workspace
        </button>
      </div>
    </div>
  );
}
