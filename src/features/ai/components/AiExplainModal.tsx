import { useState } from 'react';
import { Bot, Sparkles, ShieldCheck, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { useOllamaStatus } from '../api/useAi';

interface AiExplainModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPrompt?: string;
  initialContext?: string;
}

export const AiExplainModal = ({ open, onOpenChange, initialPrompt = '' }: AiExplainModalProps) => {
  const { data: status } = useOllamaStatus();

  const [prompt, setPrompt] = useState(initialPrompt);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [result] = useState<string | null>(null);

  const activeModel = selectedModel || (status?.models && status.models[0]) || '';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 text-fg shadow-2xl">
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

          <div className="mt-3 flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div>
              <span className="font-bold">Coming back after safety review (T-11):</span> Local AI
              Explain is temporarily frozen while selective pattern masking and direct HTTP Ollama
              transport (replacing argv prompt passing) are implemented in Phase B.
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

            {result && (
              <div>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  Explanation & Diagnosis
                </span>
                <div className="mt-1 max-h-48 overflow-y-auto rounded border border-border bg-black/20 p-3 font-sans text-xs leading-relaxed whitespace-pre-wrap text-fg">
                  {result}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-border pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button type="button" variant="default" size="sm" disabled={true}>
                Frozen (Safety Review)
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
