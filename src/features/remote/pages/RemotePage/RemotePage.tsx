import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileDown, History, Plus, RefreshCw, Server } from 'lucide-react';
import { useIpcEvent } from '@/shared/tauri';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { useRemoteState } from '@/features/remote/api/useRemoteState';
import { useRemoteStatus } from '@/features/remote/api/useRemoteStatus';
import { useCheckAll } from '@/features/remote/api/useCheckAll';
import { useRecordHostHistory } from '@/features/remote/api/useHostHistory';
import { remoteKeys } from '@/features/remote/api/keys';
import { snapshotSchema } from '@/features/remote/api/remote.schema';
import { groupHosts, projectNames } from '@/features/remote/utils/grouping';
import { ConsentPanel } from '@/features/remote/components/ConsentPanel';
import { HostList } from '@/features/remote/components/HostList';
import { HostDetail } from '@/features/remote/components/HostDetail';
import { ImportHostsDialog } from '@/features/remote/components/ImportHostsDialog';
import { AddHostDialog } from '@/features/remote/components/AddHostDialog';
import { EditHostDialog } from '@/features/remote/components/EditHostDialog';
import { JournalDialog } from '@/features/remote/components/JournalDialog';

/** Master-detail: servers grouped by project on the left, the selected
 * server's health on the right. Nothing connects until the user says so. */
export const RemotePage = () => {
  const state = useRemoteState();
  const status = useRemoteStatus();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const checkAll = useCheckAll();
  const qc = useQueryClient();
  useRecordHostHistory();
  // Background checks (Rust, tray) push fresh snapshots; show them here too.
  useIpcEvent<{ id: string; snapshot: unknown }>('remote://snapshot', (e) => {
    const parsed = snapshotSchema.safeParse(e.payload.snapshot);
    if (parsed.success) qc.setQueryData(remoteKeys.snapshot(e.payload.id), parsed.data);
  });

  const hosts = state.data?.hosts ?? [];
  const granted = state.data?.consent.granted ?? false;
  const projects = projectNames(hosts);
  // Default to the first host in list order, which is never a prod host
  // unless a project has nothing else.
  const first = groupHosts(hosts)[0]?.hosts[0] ?? null;
  const active = hosts.find((h) => h.id === selectedId) ?? first;
  const connectedCount = hosts.filter((h) => status.data?.get(h.id)).length;

  const subtitle = state.isPending
    ? 'Your SSH servers'
    : hosts.length === 0
      ? 'Your SSH servers'
      : `${hosts.length} server${hosts.length === 1 ? '' : 's'} · ${connectedCount} connected`;

  const dialogs = (
    <>
      <ImportHostsDialog open={importOpen} onOpenChange={setImportOpen} />
      <JournalDialog open={historyOpen} onOpenChange={setHistoryOpen} />
      <AddHostDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projects={projects}
        onAdded={setSelectedId}
      />
      {editing && active && (
        <EditHostDialog host={active} projects={projects} onClose={() => setEditing(false)} />
      )}
    </>
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-fg">Servers</h1>
          <p className="text-sm text-fg-muted tabular-nums">{subtitle}</p>
        </div>
        {(granted || hosts.length > 0) && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              title="Re-check every connected server now"
              disabled={checkAll.count === 0 || checkAll.running}
              onClick={() => void checkAll.run()}
            >
              <RefreshCw
                className={cn(
                  'h-4 w-4',
                  checkAll.running && 'animate-spin motion-reduce:animate-none',
                )}
              />
              Check all
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Server history"
              title="History"
              onClick={() => setHistoryOpen(true)}
            >
              <History className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
              <FileDown className="h-4 w-4" />
              Import from SSH config
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add server
            </Button>
          </div>
        )}
      </header>

      {state.isError ? (
        <div className="p-6">
          <ErrorPanel
            error={state.error}
            fallback="Couldn't load your servers"
            onRetry={() => void state.refetch()}
          />
        </div>
      ) : !state.isPending && !granted && hosts.length === 0 ? (
        <div className="min-h-0 flex-1 p-6">
          <div className="h-full overflow-auto rounded-xl border border-border bg-paper">
            <ConsentPanel onAddManually={() => setAddOpen(true)} />
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr] gap-4 p-6">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-paper">
            <HostList
              hosts={hosts}
              activeId={active?.id ?? null}
              isLoading={state.isPending}
              onSelect={setSelectedId}
            />
          </section>
          {active ? (
            <HostDetail key={active.id} host={active} onEdit={() => setEditing(true)} />
          ) : (
            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-paper">
              {state.isPending ? null : (
                <EmptyState
                  icon={<Server className="h-8 w-8" />}
                  title="No servers yet"
                  description="Import hosts from your SSH config, or add one by hand."
                  action={
                    <Button size="sm" onClick={() => setImportOpen(true)}>
                      <FileDown className="h-4 w-4" />
                      Import from SSH config
                    </Button>
                  }
                />
              )}
            </section>
          )}
        </div>
      )}
      {dialogs}
    </div>
  );
};
