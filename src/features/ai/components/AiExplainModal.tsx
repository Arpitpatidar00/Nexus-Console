import { useState, useEffect, useCallback } from 'react';
import { Bot, Sparkles, ShieldCheck, X, Eye, Loader2 } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { useIpcEvent } from '@/shared/tauri/events';
import { useOllamaStatus, usePreparePrompt, useAiExplain } from '../api/useAi';

interface AiExplainModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPrompt?: string;
  initialContext?: string;
}

export const AiExplainModal = ({
  open,
  onOpenChange,
  initialPrompt = '',
  initialContext,
}: AiExplainModalProps) => {
  const { data: status } = useOllamaStatus();
  const { mutate: preparePrompt } = usePreparePrompt();
  const explainMutation = useAiExplain();

  const [prompt, setPrompt] = useState(initialPrompt);
  const [context, setContext] = useState(initialContext || '');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [streamedText, setStreamedText] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string>('');
  const [previewNotice, setPreviewNotice] = useState<string>(
    'This exact text will be sent to Ollama on this Mac',
  );

  const activeModel = selectedModel || (status?.models && status.models[0]) || '';

  // Keep prompt preview synchronized with backend pattern redaction
  useEffect(() => {
    if (!prompt.trim() && !context.trim()) {
      setPreviewText('');
      return;
    }
    const timer = setTimeout(() => {
      preparePrompt(
        { prompt, context: context.trim() ? context : undefined },
        {
          onSuccess: (data) => {
            setPreviewText(data.prompt);
            setPreviewNotice(data.notice);
          },
        },
      );
    }, 200);
    return () => clearTimeout(timer);
  }, [prompt, context, preparePrompt]);

  // Handle incoming stream chunks
  const handleChunk = useCallback((event: { payload: { chunk: string; done: boolean } }) => {
    if (event.payload.chunk) {
      setStreamedText((prev) => (prev ?? '') + event.payload.chunk);
    }
  }, []);

  useIpcEvent<{ chunk: string; done: boolean }>('ai:stream-chunk', handleChunk);

  const handleExplain = () => {
    if (!prompt.trim() || !activeModel) return;
    setStreamedText('');
    explainMutation.mutate(
      {
        prompt,
        context: context.trim() ? context : undefined,
        model: activeModel,
      },
      {
        onSuccess: (data) => {
          setStreamedText((current) => current || data.explanation);
        },
      },
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-6 text-fg shadow-2xl">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <Dialog.Title className="flex items-center gap-2 text-base font-bold text-fg">
              <Bot className="h-5 w-5 text-indigo-400" />
              Local AI Assistant (Ollama)
            </Dialog.Title>
            <div className="flex items-center gap-2">
              <Badge variant={status?.online ? 'success' : 'neutral'} className="text-[10px]">
                {status?.online ? 'Ollama Online' : 'Ollama Offline'}
              </Badge>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="text-muted-fg hover:text-fg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2 rounded border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-200">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div>
              <span className="font-bold">Privacy Guaranteed (T-11):</span> Calls local Ollama via
              direct native HTTP to <code className="font-mono">127.0.0.1:11434</code> without shell
              or argv interpolation. Secrets matching known patterns (AWS, Stripe, GitHub, etc.) are
              redacted before transmission.
            </div>
          </div>

          {status && !status.online && (
            <div className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
              Ollama server was not detected on <code className="font-mono">127.0.0.1:11434</code>.
              Start Ollama in your terminal using:
              <pre className="mt-1 rounded bg-black/20 p-1.5 font-mono text-[11px]">
                ollama run llama3.2
              </pre>
            </div>
          )}

          <div className="mt-4 space-y-4">
            {status?.models && status.models.length > 0 && (
              <div>
                <label htmlFor="ai-model-select" className="text-xs font-semibold text-fg">
                  Local Model
                </label>
                <select
                  id="ai-model-select"
                  value={activeModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="mt-1 w-full rounded border border-border bg-muted/20 px-3 py-1.5 font-mono text-xs text-fg focus:outline-none"
                >
                  {status.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="ai-prompt-input" className="text-xs font-semibold text-fg">
                What would you like explained or diagnosed?
              </label>
              <textarea
                id="ai-prompt-input"
                rows={3}
                placeholder="Paste command error, shell output, regex pattern, or cron expression..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="placeholder:text-muted-fg mt-1 w-full rounded border border-border bg-muted/20 p-2.5 font-mono text-xs text-fg focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="ai-context-input" className="text-xs font-semibold text-fg">
                Optional Context (logs, config, stack trace)
              </label>
              <textarea
                id="ai-context-input"
                rows={2}
                placeholder="Paste optional context or error logs..."
                value={context}
                onChange={(e) => setContext(e.target.value)}
                className="placeholder:text-muted-fg mt-1 w-full rounded border border-border bg-muted/20 p-2.5 font-mono text-xs text-fg focus:outline-none"
              />
            </div>

            {/* Prompt preview with explicit notice */}
            {previewText && (
              <div className="rounded border border-border bg-muted/10 p-3">
                <div className="text-muted-fg mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
                  <Eye className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Prompt Preview</span>
                  <Badge variant="neutral" className="ml-auto font-mono text-[10px]">
                    {previewNotice}
                  </Badge>
                </div>
                <pre className="text-muted-fg/90 max-h-28 overflow-y-auto rounded bg-black/20 p-2 font-mono text-[11px] whitespace-pre-wrap">
                  {previewText}
                </pre>
              </div>
            )}

            {(streamedText || explainMutation.isPending) && (
              <div>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  Explanation & Diagnosis
                  {explainMutation.isPending && (
                    <Loader2 className="text-muted-fg ml-1 h-3 w-3 animate-spin" />
                  )}
                </span>
                <div className="mt-1 max-h-48 overflow-y-auto rounded border border-border bg-black/20 p-3 font-sans text-xs leading-relaxed whitespace-pre-wrap text-fg">
                  {streamedText || 'Thinking...'}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-border pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleExplain}
                disabled={!status?.online || !prompt.trim() || explainMutation.isPending}
              >
                {explainMutation.isPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Explain with Local AI'
                )}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
