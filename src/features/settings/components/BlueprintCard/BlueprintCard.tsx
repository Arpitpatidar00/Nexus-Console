import { useState } from 'react';
import { Download, Upload, Cpu, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import {
  useBlueprintExport,
  useBlueprintAnalyze,
  useApplyHomebrew,
  useApplyHosts,
  useApplyWorkspaces,
  useApplyExtensions,
} from '@/features/blueprint/api/useBlueprint';
import type {
  BlueprintDiffReport,
  NexusBlueprint,
} from '@/features/blueprint/api/blueprint.schema';

export const BlueprintCard = () => {
  const exportMutation = useBlueprintExport();
  const analyzeMutation = useBlueprintAnalyze();
  const applyHomebrewMutation = useApplyHomebrew();
  const applyHostsMutation = useApplyHosts();
  const applyWorkspacesMutation = useApplyWorkspaces();
  const applyExtensionsMutation = useApplyExtensions();

  const [importJson, setImportJson] = useState('');
  const [diffReport, setDiffReport] = useState<BlueprintDiffReport | null>(null);
  const [parsedBlueprint, setParsedBlueprint] = useState<NexusBlueprint | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const handleExport = () => {
    exportMutation.mutate(undefined, {
      onSuccess: (data) => {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `stackroost-blueprint-${data.macHostname}.json`;
        a.click();
        URL.revokeObjectURL(url);
      },
    });
  };

  const handleAnalyze = () => {
    if (!importJson.trim()) return;
    try {
      const parsed = JSON.parse(importJson) as NexusBlueprint;
      setParsedBlueprint(parsed);
      analyzeMutation.mutate(importJson, {
        onSuccess: (report) => {
          setDiffReport(report);
        },
      });
    } catch {
      alert('Invalid JSON format in blueprint');
    }
  };

  const handleApplyHomebrew = () => {
    if (!parsedBlueprint?.brewfile) return;
    applyHomebrewMutation.mutate(parsedBlueprint.brewfile);
  };

  const handleApplyHosts = () => {
    if (!diffReport?.missingHosts.length) return;
    applyHostsMutation.mutate(diffReport.missingHosts);
  };

  const handleApplyWorkspaces = () => {
    if (!parsedBlueprint?.workspaces.length) return;
    applyWorkspacesMutation.mutate(parsedBlueprint.workspaces);
  };

  const handleApplyExtensions = () => {
    if (!diffReport?.missingExtensions.length) return;
    applyExtensionsMutation.mutate(diffReport.missingExtensions);
  };

  return (
    <div className="rounded-xl border border-border bg-paper p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-accent-soft flex h-10 w-10 items-center justify-center rounded-lg text-accent">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-fg">Mac Blueprint</h3>
            <p className="text-xs text-fg-muted">
              Export and import complete machine profiles (Brewfile, servers without keys, tunnels,
              workspaces, rules)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exportMutation.isPending}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {exportMutation.isPending ? 'Exporting…' : 'Export Blueprint'}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setImportModalOpen(true)}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Import Blueprint…
          </Button>
        </div>
      </div>

      <div className="mt-4 text-xs leading-relaxed text-fg-muted">
        Blueprints let you clone your developer environment onto another Mac. Private SSH keys and
        passwords are strictly omitted from exports. Importing performs a non-destructive visual
        diff before applying changes.
      </div>

      {/* Import & Visual Diff Dialog */}
      <Dialog.Root open={importModalOpen} onOpenChange={setImportModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[var(--z-dialog-overlay)] bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-[var(--z-dialog)] max-h-[85vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-paper p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-accent" />
                <Dialog.Title className="text-base font-semibold text-fg">
                  Import & Diff Mac Blueprint
                </Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close dialog"
                  className="hover:bg-hover rounded-lg p-1 text-fg-muted hover:text-fg"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            {!diffReport ? (
              <div className="mt-4 flex flex-col gap-4">
                <p className="text-xs text-fg-muted">
                  Paste the exported <code className="font-mono">stackroost-blueprint.json</code>{' '}
                  content below to inspect differences:
                </p>
                <textarea
                  id="blueprint-json-input"
                  aria-label="Blueprint JSON Payload"
                  rows={8}
                  placeholder='{
  "schemaVersion": 1,
  "brewfile": "..."
}'
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                  className="bg-subtle w-full rounded-lg border border-border p-3 font-mono text-xs text-fg focus:border-accent focus:outline-none"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setImportModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleAnalyze}
                    disabled={!importJson.trim() || analyzeMutation.isPending}
                  >
                    {analyzeMutation.isPending ? 'Analyzing Diff…' : 'Inspect Differences'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-4">
                <div className="flex items-center justify-between text-xs text-fg-muted">
                  <span>Blueprint from {parsedBlueprint?.macHostname}</span>
                  <button
                    type="button"
                    onClick={() => setDiffReport(null)}
                    className="text-accent hover:underline"
                  >
                    Load another file
                  </button>
                </div>

                {/* Diff Results Grid */}
                <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
                  {/* Homebrew Missing */}
                  <div className="bg-subtle flex flex-col justify-between rounded-lg border border-border p-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between font-semibold text-fg">
                        <span>Homebrew Differences</span>
                        <Badge variant="neutral">
                          {diffReport.missingFormulae.length + diffReport.missingCasks.length}{' '}
                          missing
                        </Badge>
                      </div>
                      <p className="mb-2 text-[11px] text-fg-muted">
                        Formulae: {diffReport.missingFormulae.slice(0, 3).join(', ') || 'None'}
                        {diffReport.missingFormulae.length > 3
                          ? ` (+${diffReport.missingFormulae.length - 3} more)`
                          : ''}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleApplyHomebrew}
                      disabled={
                        applyHomebrewMutation.isPending ||
                        (diffReport.missingFormulae.length === 0 &&
                          diffReport.missingCasks.length === 0)
                      }
                    >
                      {applyHomebrewMutation.isPending ? 'Installing…' : 'Run brew bundle install'}
                    </Button>
                  </div>

                  {/* Remote Hosts Missing */}
                  <div className="bg-subtle flex flex-col justify-between rounded-lg border border-border p-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between font-semibold text-fg">
                        <span>Servers & Hosts</span>
                        <Badge variant="neutral">{diffReport.missingHosts.length} missing</Badge>
                      </div>
                      <p className="mb-2 text-[11px] text-fg-muted">
                        {diffReport.missingHosts.map((h) => h.alias ?? h.label).join(', ') ||
                          'All hosts present'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleApplyHosts}
                      disabled={
                        applyHostsMutation.isPending || diffReport.missingHosts.length === 0
                      }
                    >
                      {applyHostsMutation.isPending ? 'Importing…' : 'Import Missing Hosts'}
                    </Button>
                  </div>

                  {/* Workspaces Missing */}
                  <div className="bg-subtle flex flex-col justify-between rounded-lg border border-border p-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between font-semibold text-fg">
                        <span>Workspaces</span>
                        <Badge variant="neutral">
                          {diffReport.missingWorkspaces.length} missing
                        </Badge>
                      </div>
                      <p className="mb-2 text-[11px] text-fg-muted">
                        {diffReport.missingWorkspaces.join(', ') || 'All workspaces present'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleApplyWorkspaces}
                      disabled={
                        applyWorkspacesMutation.isPending ||
                        diffReport.missingWorkspaces.length === 0
                      }
                    >
                      {applyWorkspacesMutation.isPending ? 'Importing…' : 'Import Workspaces'}
                    </Button>
                  </div>

                  {/* VS Code Extensions */}
                  <div className="bg-subtle flex flex-col justify-between rounded-lg border border-border p-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between font-semibold text-fg">
                        <span>VS Code Extensions</span>
                        <Badge variant="neutral">
                          {diffReport.missingExtensions.length} missing
                        </Badge>
                      </div>
                      <p className="mb-2 text-[11px] text-fg-muted">
                        {diffReport.missingExtensions.slice(0, 3).join(', ') ||
                          'All extensions installed'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleApplyExtensions}
                      disabled={
                        applyExtensionsMutation.isPending ||
                        diffReport.missingExtensions.length === 0
                      }
                    >
                      {applyExtensionsMutation.isPending ? 'Installing…' : 'Install Extensions'}
                    </Button>
                  </div>
                </div>

                <div className="mt-4 flex justify-end border-t border-border pt-4">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => setImportModalOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
