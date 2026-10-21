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
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-info" />
            <h3 className="text-sm font-semibold">Context Window Analysis</h3>
          </div>
          <button type="button" onClick={onClose} className="text-fg-muted hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-xs text-fg-muted">
            Analyzing session context...
          </div>
        ) : !analysis ? (
          <div className="py-8 text-center text-xs text-fg-muted">
            Unable to inspect session context.
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {/* Progress Bar & Percentage */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-fg-muted">Context Window Capacity</span>
                <span className="font-mono font-semibold text-fg">
                  {analysis.totalTokens.toLocaleString()} / {analysis.maxTokens.toLocaleString()}{' '}
                  tokens ({analysis.pctUsed.toFixed(1)}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full border border-border bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${
                    analysis.pctUsed > 80
                      ? 'bg-destructive'
                      : analysis.pctUsed > 50
                        ? 'bg-warning'
                        : 'bg-success'
                  }`}
                  style={{ width: `${Math.min(100, analysis.pctUsed)}%` }}
                />
              </div>
            </div>

            {/* Recommendation Banner */}
            <div
              className={`flex items-start gap-2.5 rounded-lg border p-3 ${
                analysis.pctUsed > 80
                  ? 'border-danger-soft bg-danger-soft text-destructive'
                  : 'border-info-soft bg-info-soft text-info'
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
            <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-3">
              <div className="text-[11px] font-semibold tracking-wider text-fg-muted uppercase">
                Memory Breakdown
              </div>
              <div className="space-y-2">
                {analysis.largeItems.map((item) => (
                  <div key={item.label} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-fg">{item.label}</span>
                      <span className="font-mono text-fg-muted">
                        ~{item.tokenEstimate.toLocaleString()} tokens ({item.pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas">
                      <div
                        className="h-full rounded-full bg-info/70"
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
                className="rounded-lg border border-border bg-muted px-4 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-canvas"
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
