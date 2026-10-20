import { X, AlertTriangle, CheckCircle, Brain } from 'lucide-react';
import { useSessionContext } from '../api/useArchiverUpgrades';

interface ContextAnalysisModalProps {
  dirName: string;
  sessionFile: string;
  onClose: () => void;
}

export function ContextAnalysisModal({ dirName, sessionFile, onClose }: ContextAnalysisModalProps) {
  const { data: analysis, isLoading } = useSessionContext(dirName, sessionFile);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="bg-surface-elevated border-border-subtle w-full max-w-md space-y-4 rounded-xl border p-5 shadow-2xl">
        <div className="border-border-subtle flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-400" />
            <h3 className="text-sm font-semibold">Context Window Analysis</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="text-text-muted py-12 text-center text-xs">
            Analyzing session context...
          </div>
        ) : !analysis ? (
          <div className="text-text-muted py-8 text-center text-xs">
            Unable to inspect session context.
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {/* Progress Bar & Percentage */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-text-muted font-medium">Context Window Capacity</span>
                <span className="text-text-primary font-mono font-semibold">
                  {analysis.totalTokens.toLocaleString()} / {analysis.maxTokens.toLocaleString()}{' '}
                  tokens ({analysis.pctUsed.toFixed(1)}%)
                </span>
              </div>
              <div className="bg-surface-subtle border-border-subtle h-2 w-full overflow-hidden rounded-full border">
                <div
                  className={`h-full rounded-full transition-all ${
                    analysis.pctUsed > 80
                      ? 'bg-red-500'
                      : analysis.pctUsed > 50
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, analysis.pctUsed)}%` }}
                />
              </div>
            </div>

            {/* Recommendation Banner */}
            <div
              className={`flex items-start gap-2.5 rounded-lg border p-3 ${
                analysis.pctUsed > 80
                  ? 'border-red-500/20 bg-red-500/10 text-red-400'
                  : 'border-blue-500/20 bg-blue-500/10 text-blue-400'
              }`}
            >
              {analysis.pctUsed > 80 ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div className="space-y-0.5">
                <div className="text-xs font-semibold">AI Recommendation</div>
                <div className="text-[11px] leading-relaxed">{analysis.recommendation}</div>
              </div>
            </div>

            {/* Breakdown List */}
            <div className="border-border-subtle bg-surface-subtle/50 space-y-2 rounded-lg border p-3">
              <div className="text-text-muted text-[11px] font-semibold tracking-wider uppercase">
                Memory Breakdown
              </div>
              <div className="space-y-2">
                {analysis.largeItems.map((item) => (
                  <div key={item.label} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-text-primary">{item.label}</span>
                      <span className="text-text-muted font-mono">
                        ~{item.tokenEstimate.toLocaleString()} tokens ({item.pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="bg-surface-base h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full bg-purple-500/70"
                        style={{ width: `${Math.min(100, item.pct)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="bg-surface-subtle hover:bg-surface-base border-border-subtle text-text-primary rounded-lg border px-4 py-1.5 text-xs font-medium transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
