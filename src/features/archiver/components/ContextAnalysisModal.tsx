import { AlertTriangle, CheckCircle } from 'lucide-react';
import { Dialog } from '@/shared/ui/Dialog';
import { useSessionContext } from '../api/useArchiverUpgrades';

interface ContextAnalysisModalProps {
  dirName: string;
  sessionFile: string;
  onClose: () => void;
}

export function ContextAnalysisModal({ dirName, sessionFile, onClose }: ContextAnalysisModalProps) {
  const { data: analysis, isLoading } = useSessionContext(dirName, sessionFile);

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Context window analysis"
      description="How much of the model's context this session uses, and what fills it."
    >
      {isLoading ? (
        <div className="py-12 text-center text-xs text-fg-muted">Analyzing session context...</div>
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
        </div>
      )}
    </Dialog>
  );
}
