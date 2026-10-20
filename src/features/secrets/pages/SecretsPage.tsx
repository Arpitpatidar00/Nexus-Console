import { useState } from 'react';
import {
  ShieldCheck,
  Search,
  Terminal,
  FolderGit2,
  Copy,
  Check,
  Info,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { useScanProjectsSecrets, useScanHistorySecrets } from '../api/useSecrets';
import type { SecretFinding } from '../api/secrets.schema';

export const SecretsPage = () => {
  const scanProjects = useScanProjectsSecrets();
  const scanHistory = useScanHistorySecrets();

  const [findings, setFindings] = useState<SecretFinding[]>([]);
  const [scannedStats, setScannedStats] = useState<{ projects: number; files: number } | null>(
    null,
  );
  const [historyConsent, setHistoryConsent] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const isScanning = scanProjects.isPending || scanHistory.isPending;

  const handleScanProjects = () => {
    scanProjects.mutate(undefined, {
      onSuccess: (res) => {
        setFindings(res.findings);
        setScannedStats({ projects: res.scannedProjects, files: res.scannedFiles });
      },
    });
  };

  const handleScanHistory = () => {
    if (!historyConsent) return;
    scanHistory.mutate(undefined, {
      onSuccess: (histFindings) => {
        setFindings((prev) => [...prev, ...histFindings]);
      },
    });
  };

  const copyRemediation = (id: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      {/* Header */}
      <div className="mb-5 flex shrink-0 items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-fg">Secrets Scanner</h1>
          <p className="text-xs text-fg-muted">
            Detect git-tracked credentials, unignored .env files, and leaked keys in your local
            workspace.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="default" size="sm" onClick={handleScanProjects} disabled={isScanning}>
            <FolderGit2 className="mr-1.5 h-3.5 w-3.5" />
            {scanProjects.isPending ? 'Scanning Projects…' : 'Scan Git Projects'}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        {/* Security & Privacy Contract Banner */}
        <div className="bg-accent-soft flex items-start gap-3 rounded-xl border border-accent/30 p-4 shadow-xs">
          <Info className="h-5 w-5 shrink-0 text-accent" />
          <div className="text-xs">
            <h4 className="font-semibold text-fg">Privacy &amp; Safety Guarantees</h4>
            <p className="mt-0.5 text-fg-muted">
              Scans operate 100% locally on your Mac. All detected secrets are{' '}
              <strong>masked</strong> in memory and UI. Stackroost never writes or rewrites your git
              commit history — actionable remediation instructions are provided for you to execute
              safely.
            </p>
          </div>
        </div>

        {/* Shell History Scan Option */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-paper p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <Terminal className="h-5 w-5 text-fg-muted" />
            <div>
              <h4 className="text-sm font-semibold text-fg">Shell History Inspection</h4>
              <p className="text-xs text-fg-muted">
                Inspect ~/.zsh_history and ~/.bash_history for leaked keys (requires consent).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-fg">
              <input
                type="checkbox"
                checked={historyConsent}
                onChange={(e) => setHistoryConsent(e.target.checked)}
                className="rounded border-border"
              />
              <span>I give consent to scan shell history</span>
            </label>

            <Button
              variant="outline"
              size="sm"
              disabled={!historyConsent || isScanning}
              onClick={handleScanHistory}
            >
              Scan History
            </Button>
          </div>
        </div>

        {/* Stats Strip */}
        {scannedStats && (
          <div className="flex items-center gap-4 text-xs text-fg-muted">
            <span>
              Scanned: <strong className="text-fg">{scannedStats.projects}</strong> projects
            </span>
            <span>•</span>
            <span>
              Files inspected: <strong className="text-fg">{scannedStats.files}</strong>
            </span>
            <span>•</span>
            <span>
              Findings:{' '}
              <strong className={findings.length > 0 ? 'text-danger' : 'text-emerald-500'}>
                {findings.length}
              </strong>
            </span>
          </div>
        )}

        {/* Findings List */}
        <div className="flex flex-col gap-3">
          {findings.map((f) => (
            <div
              key={f.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-paper p-4 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Badge variant={f.severity === 'critical' ? 'danger' : 'warning'}>
                    {f.severity.toUpperCase()}
                  </Badge>
                  <h4 className="text-sm font-semibold text-fg">{f.ruleName}</h4>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-fg-muted">
                    {f.filePath}
                    {f.lineNumber !== null && f.lineNumber !== undefined ? `:${f.lineNumber}` : ''}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-black/10 p-2.5">
                <span className="text-[11px] font-semibold text-fg-muted">Masked Value:</span>
                <p className="font-mono text-xs text-fg">{f.maskedPreview}</p>
              </div>

              <div className="bg-accent-soft/40 flex items-center justify-between rounded-lg px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                  <span className="text-fg">{f.remediation}</span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyRemediation(f.id, f.remediation)}
                >
                  {copiedId === f.id ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          ))}

          {scannedStats && findings.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
              <ShieldCheck className="h-10 w-10 text-emerald-500" />
              <h3 className="mt-3 text-sm font-semibold text-fg">All Repositories Clean</h3>
              <p className="mt-1 text-xs text-fg-muted">
                No plaintext credentials or unignored .env files detected across your tracked
                projects.
              </p>
            </div>
          )}

          {!scannedStats && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
              <Search className="h-10 w-10 text-fg-muted/40" />
              <h3 className="mt-3 text-sm font-semibold text-fg">Ready to Scan</h3>
              <p className="mt-1 text-xs text-fg-muted">
                Click “Scan Git Projects” above to inspect tracked files for exposed keys and
                tokens.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
