import { useQuery, useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, CMD } from '@/shared/tauri';
import {
  claudeSearchResultsSchema,
  sessionContextAnalysisSchema,
  projectTokenUsageSchema,
  type ClaudeSearchResult,
  type SessionContextAnalysis,
  type ProjectTokenUsage,
} from './archiver.schema';

export function useClaudeSearch(query: string) {
  return useQuery<ClaudeSearchResult[]>({
    queryKey: ['claude', 'search', query],
    queryFn: () => ipc(CMD.CLAUDE_SEARCH_TRANSCRIPTS, { query }, claudeSearchResultsSchema),
    enabled: query.trim().length >= 2,
    staleTime: 5_000,
  });
}

export function useExportMarkdown() {
  return useMutation({
    mutationFn: (params: { dirName: string; sessionFile: string }) =>
      ipc(CMD.CLAUDE_EXPORT_MARKDOWN, params, z.string()),
  });
}

export function useSessionContext(dirName: string | null, sessionFile: string | null) {
  return useQuery<SessionContextAnalysis>({
    queryKey: ['claude', 'context', dirName, sessionFile],
    queryFn: () =>
      ipc(
        CMD.CLAUDE_SESSION_CONTEXT,
        { dirName: dirName!, sessionFile: sessionFile! },
        sessionContextAnalysisSchema,
      ),
    enabled: Boolean(dirName && sessionFile),
  });
}

export function useProjectUsage(dirName: string | null) {
  return useQuery<ProjectTokenUsage>({
    queryKey: ['claude', 'usage', dirName],
    queryFn: () => ipc(CMD.CLAUDE_PROJECT_USAGE, { dirName: dirName! }, projectTokenUsageSchema),
    enabled: Boolean(dirName),
    staleTime: 30_000,
  });
}
