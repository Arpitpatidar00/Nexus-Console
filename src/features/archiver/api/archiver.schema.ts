import { z } from 'zod';

export const claudeProjectSchema = z.object({
  dirName: z.string(),
  displayName: z.string(),
  realPath: z.string().nullable(),
  sessions: z.number(),
  totalBytes: z.number(),
  newestEpoch: z.number().nullable(),
  cacheBytes: z.number().nullable(),
});
export const claudeProjectsSchema = z.array(claudeProjectSchema);
export type ClaudeProject = z.infer<typeof claudeProjectSchema>;

export const archiveResultSchema = z.object({
  candidates: z.array(z.string()),
  moved: z.number(),
  skipped: z.array(z.string()),
});
export type ArchiveResult = z.infer<typeof archiveResultSchema>;

export const bulkResultSchema = z.object({
  done: z.number(),
  skipped: z.array(z.string()),
});
export type BulkResult = z.infer<typeof bulkResultSchema>;

export const chatSchema = z.object({ file: z.string(), epoch: z.number(), title: z.string() });
export const chatsSchema = z.array(chatSchema);
export type Chat = z.infer<typeof chatSchema>;

export const archivedProjectSchema = z.object({
  folder: z.string(),
  dirName: z.string().nullable(),
  totalBytes: z.number(),
  chats: chatsSchema,
});
export const archivedProjectsSchema = z.array(archivedProjectSchema);
export type ArchivedProject = z.infer<typeof archivedProjectSchema>;

export const claudeSettingsSchema = z.object({
  cleanupPeriodDays: z.number().nullable(),
  archiveRoot: z.string(),
});
export type ClaudeSettings = z.infer<typeof claudeSettingsSchema>;

/** Below this, restored/new chats risk silent deletion by Claude's cleanup. */
export const RETENTION_WARN_DAYS = 90;

export const claudeSearchResultSchema = z.object({
  dirName: z.string(),
  sessionFile: z.string(),
  sessionTitle: z.string(),
  snippet: z.string(),
  lineNumber: z.number(),
});
export const claudeSearchResultsSchema = z.array(claudeSearchResultSchema);
export type ClaudeSearchResult = z.infer<typeof claudeSearchResultSchema>;

export const contextItemSchema = z.object({
  label: z.string(),
  tokenEstimate: z.number(),
  pct: z.number(),
});
export type ContextItem = z.infer<typeof contextItemSchema>;

export const sessionContextAnalysisSchema = z.object({
  totalTokens: z.number(),
  maxTokens: z.number(),
  pctUsed: z.number(),
  userTokens: z.number(),
  assistantTokens: z.number(),
  toolResultTokens: z.number(),
  largeItems: z.array(contextItemSchema),
  recommendation: z.string(),
});
export type SessionContextAnalysis = z.infer<typeof sessionContextAnalysisSchema>;

export const projectTokenUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  estimatedCostUsd: z.number(),
});
export type ProjectTokenUsage = z.infer<typeof projectTokenUsageSchema>;
