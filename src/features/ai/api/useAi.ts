import { useMutation, useQuery } from '@tanstack/react-query';
import { ipc, CMD } from '@/shared/tauri';
import {
  ollamaStatusSchema,
  explainResponseSchema,
  preparedPromptSchema,
  type OllamaStatus,
  type ExplainResponse,
  type PreparedPrompt,
} from './ai.schema';

export const aiKeys = {
  status: () => ['ai', 'ollamaStatus'] as const,
};

export function useOllamaStatus() {
  return useQuery<OllamaStatus>({
    queryKey: aiKeys.status(),
    queryFn: () => ipc(CMD.AI_CHECK_OLLAMA, {}, ollamaStatusSchema),
    staleTime: 15_000,
  });
}

export function usePreparePrompt() {
  return useMutation<PreparedPrompt, Error, { prompt: string; context?: string }>({
    mutationFn: (args) =>
      ipc(
        CMD.AI_PREPARE_PROMPT,
        {
          prompt: args.prompt,
          context: args.context || null,
        },
        preparedPromptSchema,
      ),
  });
}

export function useAiExplain() {
  return useMutation<ExplainResponse, Error, { prompt: string; context?: string; model?: string }>({
    mutationFn: (args) =>
      ipc(
        CMD.AI_EXPLAIN,
        {
          prompt: args.prompt,
          context: args.context || null,
          model: args.model || null,
        },
        explainResponseSchema,
      ),
  });
}
