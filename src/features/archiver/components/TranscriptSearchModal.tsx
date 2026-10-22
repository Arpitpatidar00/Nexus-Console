import { useState } from 'react';
import { Search, MessageSquare, Terminal } from 'lucide-react';
import { Dialog } from '@/shared/ui/Dialog';
import { useClaudeSearch } from '../api/useArchiverUpgrades';

interface TranscriptSearchModalProps {
  onClose: () => void;
  onResume: (sessionId: string) => void;
}

export function TranscriptSearchModal({ onClose, onResume }: TranscriptSearchModalProps) {
  const [query, setQuery] = useState('');
  const { data: results = [], isLoading } = useClaudeSearch(query);

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Search chat transcripts"
      description="Full-text search across every Claude Code session on this Mac."
      size="lg"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute top-2.5 left-3 h-4 w-4 text-fg-muted" />
          <input
            type="text"
            placeholder="Search keywords across all chat transcripts..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-canvas pr-3 pl-9 text-sm text-fg focus:border-ember focus:outline-none"
          />
        </div>

        {/* Search Results List */}
        <div className="min-h-0 flex-1 space-y-2">
          {isLoading ? (
            <div className="py-8 text-center text-xs text-fg-muted">Searching transcripts...</div>
          ) : query.trim().length < 2 ? (
            <div className="py-8 text-center text-xs text-fg-muted">
              Type at least 2 characters to search across all sessions.
            </div>
          ) : results.length === 0 ? (
            <div className="py-8 text-center text-xs text-fg-muted">
              No matching transcripts found for "{query}".
            </div>
          ) : (
            results.map((r, i) => {
              const sessionId = r.sessionFile.replace('.jsonl', '');
              return (
                <div
                  key={`${r.sessionFile}_${r.lineNumber}_${i}`}
                  className="space-y-1.5 rounded-lg border border-border bg-muted/50 p-3 transition-colors hover:bg-muted"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5 text-info" />
                      <span className="font-semibold text-fg">{r.sessionTitle}</span>
                      <span className="font-mono text-[10px] text-fg-muted">{r.dirName}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onResume(sessionId)}
                      className="flex items-center gap-1 rounded bg-info-soft px-2 py-0.5 text-[10px] font-medium text-info hover:bg-info-soft"
                    >
                      <Terminal className="h-3 w-3" /> Resume
                    </button>
                  </div>

                  <div className="rounded border border-border/50 bg-canvas p-2 font-mono text-[11px] break-all text-fg-muted">
                    Line {r.lineNumber}: {r.snippet}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Dialog>
  );
}
