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
      <div className="bg-surface-elevated border-border-subtle flex max-h-[80vh] w-full max-w-2xl flex-col space-y-4 rounded-xl border p-5 shadow-2xl">
        <div className="border-border-subtle flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-semibold">Search Claude Chat Transcripts</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="text-text-muted absolute top-3 left-3 h-4 w-4" />
          <input
            type="text"
            placeholder="Search keywords across all chat transcripts..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-surface-subtle border-border-subtle text-text-primary w-full rounded-lg border py-2 pr-3 pl-9 font-mono text-xs focus:outline-none"
          />
        </div>

        {/* Search Results List */}
        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="text-text-muted py-8 text-center text-xs">Searching transcripts...</div>
          ) : query.trim().length < 2 ? (
            <div className="text-text-muted py-8 text-center text-xs">
              Type at least 2 characters to search across all sessions.
            </div>
          ) : results.length === 0 ? (
            <div className="text-text-muted py-8 text-center text-xs">
              No matching transcripts found for "{query}".
            </div>
          ) : (
            results.map((r, i) => {
              const sessionId = r.sessionFile.replace('.jsonl', '');
              return (
                <div
                  key={`${r.sessionFile}_${r.lineNumber}_${i}`}
                  className="bg-surface-subtle/50 hover:bg-surface-subtle border-border-subtle space-y-1.5 rounded-lg border p-3 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5 text-blue-400" />
                      <span className="text-text-primary font-semibold">{r.sessionTitle}</span>
                      <span className="text-text-muted font-mono text-[10px]">{r.dirName}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onResume(sessionId)}
                      className="flex items-center gap-1 rounded bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400 hover:bg-blue-500/20"
                    >
                      <Terminal className="h-3 w-3" /> Resume
                    </button>
                  </div>

                  <div className="text-text-muted bg-surface-base border-border-subtle/50 rounded border p-2 font-mono text-[11px] break-all">
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
