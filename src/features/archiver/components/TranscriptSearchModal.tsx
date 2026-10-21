import { useState } from 'react';
import { Search, X, MessageSquare, Terminal } from 'lucide-react';
import { useClaudeSearch } from '../api/useArchiverUpgrades';

interface TranscriptSearchModalProps {
  onClose: () => void;
  onResume: (sessionId: string) => void;
}

export function TranscriptSearchModal({ onClose, onResume }: TranscriptSearchModalProps) {
  const [query, setQuery] = useState('');
  const { data: results = [], isLoading } = useClaudeSearch(query);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col space-y-4 rounded-xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-info" />
            <h3 className="text-sm font-semibold">Search Claude Chat Transcripts</h3>
          </div>
          <button type="button" onClick={onClose} className="text-fg-muted hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute top-3 left-3 h-4 w-4 text-fg-muted" />
          <input
            type="text"
            placeholder="Search keywords across all chat transcripts..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-muted py-2 pr-3 pl-9 font-mono text-xs text-fg focus:outline-none"
          />
        </div>

        {/* Search Results List */}
        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
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
    </div>
  );
}
