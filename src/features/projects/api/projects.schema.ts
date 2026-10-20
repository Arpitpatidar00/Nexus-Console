import { z } from 'zod';

export const gitCommitInfoSchema = z.object({
  hash: z.string(),
  message: z.string(),
  relativeTime: z.string(),
  author: z.string(),
});
export type GitCommitInfo = z.infer<typeof gitCommitInfoSchema>;

export const gitStatusSchema = z.object({
  branch: z.string(),
  dirtyCount: z.number(),
  ahead: z.number(),
  behind: z.number(),
  stashCount: z.number(),
  lastCommit: gitCommitInfoSchema.nullable(),
  mergedBranches: z.array(z.string()),
});
export type GitStatus = z.infer<typeof gitStatusSchema>;

export const discoveredProjectSchema = z.object({
  name: z.string(),
  path: z.string(),
  framework: z.string(),
  git: gitStatusSchema.nullable(),
});
export type DiscoveredProject = z.infer<typeof discoveredProjectSchema>;

export const gitHubPullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.string(),
  url: z.string(),
  headRefName: z.string(),
});
export type GitHubPullRequest = z.infer<typeof gitHubPullRequestSchema>;

export const gitHubStatusSchema = z.object({
  ghInstalled: z.boolean(),
  loggedIn: z.boolean(),
  pullRequests: z.array(gitHubPullRequestSchema),
  ciStatus: z.string().nullable(),
});
export type GitHubStatus = z.infer<typeof gitHubStatusSchema>;

export const savedCommandSchema = z.object({
  id: z.string(),
  projectPath: z.string(),
  name: z.string(),
  command: z.string(),
});
export type SavedCommand = z.infer<typeof savedCommandSchema>;

export const workspaceConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  projectPath: z.string(),
  brewServices: z.array(z.string()),
  composeProjects: z.array(z.string()),
  tunnels: z.array(z.string()),
  openVscode: z.boolean(),
  savedCommands: z.array(savedCommandSchema),
});
export type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>;
