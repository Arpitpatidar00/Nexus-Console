import { useEffect, useMemo, useState } from 'react';
import { setTrayServers } from '@/shared/tauri/notify';
import { useQueryClient } from '@tanstack/react-query';
import { FileDown, History, Plus, RefreshCw, Server } from 'lucide-react';
import { useIpcEvent } from '@/shared/tauri';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Panel } from '@/shared/ui/Panel';
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
 * server's health on the right. Smoked Glass layout with bento panels. */
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
  useIpcEvent<string>('open-server', (e) => {
    setSelectedId(e.payload);
  });

  useIpcEvent<{ id: string; snapshot: unknown }>('remote://snapshot', (e) => {
    const parsed = snapshotSchema.safeParse(e.payload.snapshot);
    if (parsed.success) qc.setQueryData(remoteKeys.snapshot(e.payload.id), parsed.data);
  });

  const hosts = useMemo(() => state.data?.hosts ?? [], [state.data?.hosts]);
  const granted = state.data?.consent.granted ?? false;
  const projects = projectNames(hosts);
  const first = groupHosts(hosts)[0]?.hosts[0] ?? null;
  const active = hosts.find((h) => h.id === selectedId) ?? first;
  const connectedCount = hosts.filter((h) => status.data?.get(h.id)).length;

  useEffect(() => {
    if (!hosts.length) return;
    const trayItems = hosts.map((h) => {
      const isConnected = !!status.data?.get(h.id);
      return {
        id: h.id,
        label: h.label,
        env: h.env,
        connected: isConnected,
        status: isConnected ? 'Online' : 'Disconnected',
      };
    });
    setTrayServers(trayItems);
  }, [hosts, status.data]);

  const subtitle = state.isPending
    ? 'Your SSH servers'
    : hosts.length === 0
      ? 'Your SSH servers'
      : `${hosts.length} server${hosts.length === 1 ? '' : 's'} · ${projects.length} project${projects.length === 1 ? '' : 's'} · ${connectedCount} connected`;

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
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Top action header */}
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-4">
        <p className="sr-caption tabular-nums">{subtitle}</p>

        {(granted || hosts.length > 0) && (
          <div className="flex items-center gap-2.5">
            <Button
              variant="glass"
              size="sm"
              title="Re-check every connected server now"
              disabled={checkAll.count === 0 || checkAll.running}
              onClick={() => void checkAll.run()}
            >
              <RefreshCw
                className={cn(
                  'size-3.5',
                  checkAll.running && 'animate-spin motion-reduce:animate-none',
                )}
              />
              Check all
            </Button>
            <Button
              variant="glass"
              size="iconSm"
              aria-label="Server history"
              title="History"
              onClick={() => setHistoryOpen(true)}
            >
              <History className="size-4" />
            </Button>
            <Button variant="glass" size="sm" onClick={() => setImportOpen(true)}>
              <FileDown className="size-4" />
              Import SSH
            </Button>
            <Button variant="ember" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              Add server
            </Button>
          </div>
        )}
      </div>

      {state.isError ? (
        <div className="p-4">
          <ErrorPanel
            error={state.error}
            fallback="Couldn't load your servers"
            onRetry={() => void state.refetch()}
          />
        </div>
      ) : !state.isPending && !granted && hosts.length === 0 ? (
        <div className="min-h-0 flex-1">
          <div className="h-full overflow-auto rounded-xl glass">
            <ConsentPanel onAddManually={() => setAddOpen(true)} />
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 md:grid-cols-[340px_1fr]">
          {/* Left: Master Host list inside glass panel */}
          <Panel
            title="Hosts"
            subtitle="Grouped by project, prod last"
            className="flex min-h-0 flex-col overflow-hidden p-4"
          >
            <HostList
              hosts={hosts}
              activeId={active?.id ?? null}
              isLoading={state.isPending}
              onSelect={setSelectedId}
            />
          </Panel>

          {/* Right: Selected Host Detail inside glass panel */}
          {active ? (
            <HostDetail key={active.id} host={active} onEdit={() => setEditing(true)} />
          ) : (
            <Panel className="flex min-h-0 flex-col overflow-hidden p-6">
              {state.isPending ? null : (
                <EmptyState
                  icon={<Server className="size-10" />}
                  title="No servers yet"
                  description="Import hosts from your SSH config, or add one by hand."
                  action={
                    <Button size="sm" variant="ember" onClick={() => setImportOpen(true)}>
                      <FileDown className="size-4" />
                      Import from SSH config
                    </Button>
                  }
                />
              )}
            </Panel>
          )}
        </div>
      )}
      {dialogs}
    </div>
  );
};
