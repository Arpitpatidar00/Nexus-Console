# Phase 7: Projects and Workspaces — Specification

> **Phase:** P7  
> **Target Branch:** `feat/mac-clean`  
> **Status:** Implementing

---

## 1. Overview & Goals

Phase 7 introduces project orchestration and workspace lifecycle management:

1. **Projects Module (7.1):** Auto-discovers local git projects under configured roots (`projectRoots`). Inspects dirty status, ahead/behind, stash counts, last commit, and stale merged branches. Optional read-only GitHub PR and CI status via `gh` CLI.
2. **Workspaces Orchestration (7.2):** Unified workspace definitions linking projects to Homebrew services, local Docker compose stacks, SSH tunnels, and terminal commands. Starts and stops dependencies with ownership tracking to avoid killing user-started services.
3. **Saved Commands (7.3):** Author and execute named terminal commands scoped to a project inside the interactive PTY drawer.
4. **Terminal Tab Restore (7.4):** Saves active terminal tabs and directories on quit; prompts on launch to restore tabs without executing commands.
5. **Project Time Tracking (7.5):** Records active project time based on running workspaces and focused terminal directory.

---

## 2. Backend Architecture (`src-tauri/src/services/projects/`)

- `discovery.rs`: Walks project roots for folders with `.git` and marker files (`package.json`, `pubspec.yaml`, `Cargo.toml`, `go.mod`, `pyproject.toml`).
- `git.rs`: Runs local `git` commands (`status`, `rev-list`, `stash`, `log`, `branch --merged`) with zero network access by default.
- `github.rs`: Probes `gh` CLI availability and fetches open PRs and CI status (read-only).
- `store.rs`: Persists `projects.json` (saved workspaces, custom project settings, saved commands) and `workspace-state.json` (active started services ownership).
- `mod.rs`: `ProjectsState` managing discovery, git operations, and workspace lifecycle.

---

## 3. IPC Commands (`src-tauri/src/commands/projects.rs`)

- `projects_discover`: Scan and return all local projects with git status.
- `projects_git_fetch`: Trigger `git fetch` for a specific project.
- `projects_delete_merged_branches`: Prune local branches already merged into default.
- `projects_get_github_status`: Fetch PRs and CI status via `gh` CLI if available.
- `projects_list_workspaces`: List configured workspaces.
- `projects_save_workspace`: Create or update a workspace definition.
- `projects_delete_workspace`: Remove a workspace.
- `projects_start_workspace`: Launch all configured dependencies for a workspace with ownership tracking.
- `projects_stop_workspace`: Stop only the dependencies owned by this workspace.
- `projects_get_saved_commands`: Retrieve saved commands for a project.
- `projects_save_command`: Add or edit a saved command for a project.
- `projects_delete_command`: Remove a saved command.

---

## 4. Safety & Rules

- `git` commands strictly default to local repository inspection; `git fetch` runs only when explicitly triggered by the user.
- Workspace stopping tracks ownership: it will NEVER terminate a Homebrew service, tunnel, or container that was already running prior to starting the workspace.
- Saved commands only execute in the visible interactive PTY drawer, never silently in the background.
