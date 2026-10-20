import { useMemo, useState } from 'react';
import { Stethoscope } from 'lucide-react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { JournalDialog } from '@/features/doctor/components/JournalDialog';
import { ScanHero } from '@/features/doctor/components/ScanHero';
import { DoctorHeader } from '@/features/doctor/components/DoctorHeader';
import {
  DoctorScopeTabs,
  type ScopeTab,
  type ScopeTabOption,
} from '@/features/doctor/components/DoctorScopeTabs';
import { DoctorDeepScanProgress } from '@/features/doctor/components/DoctorDeepScanProgress';
import { DoctorQuickScanProgress } from '@/features/doctor/components/DoctorQuickScanProgress';
import { DoctorFindingList } from '@/features/doctor/components/DoctorFindingList';
import { useDoctorScan } from '@/features/doctor/api/useDoctorScan';
import {
  DOCTOR_SCOPES,
  type DoctorFinding,
  type DoctorScope,
} from '@/features/doctor/api/doctor.schema';

const SCOPE_LABELS: Record<DoctorScope, string> = {
  system: 'System',
  claude: 'Claude',
  vscode: 'VSCode',
  browser: 'Browser',
  disk: 'Disk',
  startup: 'Startup',
};

const SEVERITY_RANK: Record<DoctorFinding['severity'], number> = { red: 0, yellow: 1, green: 2 };

// Probes that emit an overview + per-item rows (ollama models, VSCode
// extensions): the item rows nest INSIDE the overview card instead of
// flooding the top-level list. Overviews are recognized by their authored
// summary shape.
const OVERVIEW_PATTERNS: Record<string, RegExp> = {
  ollama_models: /^\d+ ollama models?\b/,
  extension_audit: /^\d+ extensions ·/,
  browser_extensions: /^\d+ extensions? ·/,
};
const isOverview = (f: DoctorFinding) => OVERVIEW_PATTERNS[f.probeId]?.test(f.summary) ?? false;
const isNestedChild = (f: DoctorFinding) => f.probeId in OVERVIEW_PATTERNS && !isOverview(f);

export const DoctorPage = () => {
  const [tab, setTab] = useState<ScopeTab>('all');
  const [journalOpen, setJournalOpen] = useState(false);
  const {
    findings,
    scanning,
    deepScanning,
    hasScanned,
    error,
    progress,
    scan,
    deepScan,
    cancelScan,
    cancelDeepScan,
  } = useDoctorScan();

  // Tabs are DERIVED from the report — a scope without findings gets no tab,
  // and the first run shows a single call-to-action instead of empty tabs.
  const availableTabs = useMemo<ScopeTabOption[]>(() => {
    const present = new Set(findings.map((f) => f.scope));
    return [
      { value: 'all', label: 'All' },
      ...DOCTOR_SCOPES.filter((s) => present.has(s)).map((s) => ({
        value: s as ScopeTab,
        label: SCOPE_LABELS[s],
      })),
    ];
  }, [findings]);
  const effectiveTab: ScopeTab = availableTabs.some((t) => t.value === tab) ? tab : 'all';

  // Tabs filter the report; Scan always runs everything.
  const displayed = useMemo(
    () =>
      findings
        .filter((f) => effectiveTab === 'all' || f.scope === effectiveTab)
        .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]),
    [findings, effectiveTab],
  );

  const runScan = () => void scan([...DOCTOR_SCOPES]);
  const heroState = findings.length === 0 && !scanning && !deepScanning && !error;

  // Probes can emit several findings (per model, per browser) — the key must
  // be finding-unique, never just the probe id.
  const findingKey = (f: DoctorFinding) => `${f.probeId}·${f.summary}`;

  // a child with no overview present still renders standalone
  const rows = displayed.filter(
    (f) => !isNestedChild(f) || !displayed.some((x) => x.probeId === f.probeId && isOverview(x)),
  );
  const childrenOf = (f: DoctorFinding) =>
    displayed.filter((x) => x.probeId === f.probeId && !isOverview(x));

  // Browser tab: one section per browser (per-browser summaries start with the
  // browser name), plus a dedicated Extensions section whose overview nests the per-extension rows.
  const browserGroups = useMemo(() => {
    if (effectiveTab !== 'browser') return null;
    const order = ['Chrome', 'Brave', 'Edge', 'Extensions', 'Power & audio'];
    const groups = new Map<string, DoctorFinding[]>();
    for (const f of rows) {
      const g =
        f.probeId === 'browser_extensions'
          ? 'Extensions'
          : (['Chrome', 'Brave', 'Edge'].find((b) => f.summary.startsWith(b)) ?? 'Power & audio');
      const list = groups.get(g) ?? [];
      list.push(f);
      groups.set(g, list);
    }
    return order
      .filter((g) => groups.has(g))
      .map((g) => [g, groups.get(g) as DoctorFinding[]] as const);
  }, [rows, effectiveTab]);

  const attention = displayed.filter((f) => f.severity !== 'green').length;
  const subtitle = scanning
    ? 'Scanning…'
    : deepScanning
      ? 'Deep scanning — sweeping node_modules and dev caches…'
      : hasScanned
        ? `${attention} need${attention === 1 ? 's' : ''} attention · ${displayed.length - attention} healthy`
        : 'Read-only health check';

  const phase = error
    ? 'error'
    : deepScanning
      ? 'deep'
      : scanning
        ? 'scanning'
        : displayed.length > 0
          ? 'report'
          : hasScanned
            ? 'empty'
            : 'hero';

  return (
    <div className="flex h-full flex-col">
      <DoctorHeader
        findings={findings}
        subtitle={subtitle}
        scanning={scanning}
        deepScanning={deepScanning}
        heroState={heroState}
        onScan={runScan}
        onDeepScan={() => void deepScan()}
        onCancelScan={cancelScan}
        onCancelDeepScan={cancelDeepScan}
        onOpenJournal={() => setJournalOpen(true)}
      />

      {findings.length > 0 && !deepScanning && !scanning && (
        <DoctorScopeTabs tabs={availableTabs} activeTab={effectiveTab} onSelectTab={setTab} />
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-6">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-paper">
          <div key={phase} className="nx-enter flex min-h-0 flex-1 flex-col overflow-hidden">
            {error ? (
              <div className="flex h-full items-center justify-center p-6">
                <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
                  {error}
                </div>
              </div>
            ) : deepScanning ? (
              <DoctorDeepScanProgress progress={progress} onCancel={cancelDeepScan} />
            ) : scanning ? (
              <DoctorQuickScanProgress onCancel={cancelScan} />
            ) : displayed.length === 0 ? (
              hasScanned ? (
                <EmptyState
                  icon={<Stethoscope className="h-8 w-8" />}
                  title="Nothing to report"
                  description="The last scan produced no findings."
                />
              ) : (
                <ScanHero onScan={runScan} onDeepScan={() => void deepScan()} />
              )
            ) : (
              <DoctorFindingList
                browserGroups={browserGroups}
                rows={rows}
                isOverview={isOverview}
                childrenOf={childrenOf}
                findingKey={findingKey}
              />
            )}
          </div>
        </div>
      </div>

      <JournalDialog open={journalOpen} onOpenChange={setJournalOpen} />
    </div>
  );
};
