import { useState } from 'react';
import { Archive, ArchiveRestore, Trash2, FileText, Brain, Terminal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/Button';
import { Checkbox } from '@/shared/ui/Checkbox';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { cn } from '@/shared/lib/cn';
import { formatBytes } from '@/shared/lib/format';
import {
  useArchiveApply,
  useArchiveFiles,
  useDeleteChats,
  useDeleteLiveChats,
  useLiveSessions,
  useRestoreChats,
} from '@/features/archiver/api/useArchiver';
import { ChatRows, type RowAction } from './ChatRows';
import { olderThan } from './helpers';
import { useExportMarkdown, useProjectUsage } from '../../api/useArchiverUpgrades';
import { ContextAnalysisModal } from '../ContextAnalysisModal';
import type { ProjectDetailProps } from './ProjectDetail.types';

/** Age filter for the live list — the Archive… action archives what's shown. */
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: '7', label: '7d+' },
  { value: '14', label: '14d+' },
  { value: '30', label: '30d+' },
  { value: '90', label: '90d+' },
] as const;
type AgeFilter = (typeof FILTERS)[number]['value'];

const toggleIn = (set: Set<string>, file: string): Set<string> => {
  const next = new Set(set);
  if (next.has(file)) {
    next.delete(file);
  } else {
    next.add(file);
  }
  return next;
};

/** Detail pane: BOTH sides of the selected project — live chats on top
 * (filter by age, select, archive), archived below (restore/delete). The two
 * lists share the height; an empty section collapses to its header line.
 * Parent renders with key={row.id}, so all local state resets per project. */
export const ProjectDetail = ({ row }: ProjectDetailProps) => {
  const liveQuery = useLiveSessions(row.live?.dirName ?? null);
  const archiveFiles = useArchiveFiles();
  const archiveApply = useArchiveApply();
  const restore = useRestoreChats();
  const del = useDeleteChats();
  const delLive = useDeleteLiveChats();

  const [filter, setFilter] = useState<AgeFilter>('all');
  const [selLive, setSelLive] = useState<Set<string>>(new Set());
  const [selArch, setSelArch] = useState<Set<string>>(new Set());

  const liveChats = liveQuery.data ?? [];
  const shownLive = olderThan(liveChats, filter === 'all' ? 0 : Number(filter), Date.now() / 1000);
  const archChats = row.archived?.chats ?? [];
  const busy =
    archiveFiles.isPending ||
    archiveApply.isPending ||
    restore.isPending ||
    del.isPending ||
    delLive.isPending;
  const canRestore = row.live != null;
  const [inspectContextFile, setInspectContextFile] = useState<string | null>(null);
  const exportMd = useExportMarkdown();
  const usage = useProjectUsage(row.live?.dirName ?? null);

  // Cutoff archive: the native macOS dialog (shown by Rust, with the real
  // count) is the confirm — no in-app dialog needed anymore.
  const doCutoffArchive = async () => {
    if (!row.live || filter === 'all') return;
    try {
      const res = await archiveApply.mutateAsync({
        dirName: row.live.dirName,
        cutoffDays: Number(filter),
      });
      if (res.moved > 0) {
        toast.success(`Archived ${res.moved} chat${res.moved === 1 ? '' : 's'}`, {
          description: 'Restart VSCode to rebuild its session cache smaller.',
        });
      }
    } catch {
      /* surfaced by the global error toast (cancelled stays silent) */
    }
  };

  const allLiveSelected = shownLive.length > 0 && shownLive.every((c) => selLive.has(c.file));
  const allArchSelected = archChats.length > 0 && archChats.every((c) => selArch.has(c.file));

  const toggleAllLive = () =>
    setSelLive(allLiveSelected ? new Set() : new Set(shownLive.map((c) => c.file)));
  const toggleAllArch = () =>
    setSelArch(allArchSelected ? new Set() : new Set(archChats.map((c) => c.file)));

  const doArchive = async (files: string[]) => {
    if (!row.live) return;
    try {
      const res = await archiveFiles.mutateAsync({ dirName: row.live.dirName, files });
      toast.success(
        `Archived ${res.done} chat${res.done === 1 ? '' : 's'}` +
          (res.skipped.length ? ` (${res.skipped.length} skipped)` : ''),
        { description: 'Restart VSCode to rebuild its session cache smaller.' },
      );
      setSelLive(new Set());
    } catch {
      /* surfaced by the global error toast */
    }
  };

  const doRestore = async (files: string[]) => {
    if (!row.live) return;
    try {
      const res = await restore.mutateAsync({ dirName: row.live.dirName, files });
      toast.success(
        `Restored ${res.done} chat${res.done === 1 ? '' : 's'}` +
          (res.skipped.length ? ` (${res.skipped.length} skipped)` : ''),
        { description: 'Restart VSCode to see them.' },
      );
      setSelArch(new Set());
    } catch {
      /* surfaced by the global error toast */
    }
  };

  // Both delete paths are confirm-gated by a NATIVE macOS dialog shown by Rust —
  // a dismissed dialog rejects with kind 'cancelled', which stays silent.
  const doDeleteArchived = async (files: string[]) => {
    if (!row.archived) return;
    try {
      const res = await del.mutateAsync({ folder: row.archived.folder, files });
      toast.success(`Deleted ${res.done} archived chat${res.done === 1 ? '' : 's'} permanently`);
      setSelArch(new Set());
    } catch {
      /* surfaced by the global error toast (cancelled stays silent) */
    }
  };

  const doDeleteLive = async (files: string[]) => {
    if (!row.live) return;
    try {
      const res = await delLive.mutateAsync({ dirName: row.live.dirName, files });
      toast.success(`Deleted ${res.done} chat${res.done === 1 ? '' : 's'} permanently`);
      setSelLive(new Set());
    } catch {
      /* surfaced by the global error toast (cancelled stays silent) */
    }
  };

  // Per-row three-dots actions.
  const liveActions: RowAction[] = [
    {
      label: 'Resume in Terminal',
      icon: <Terminal className="h-4 w-4 text-success" />,
      disabled: busy,
      onAct: (f) => {
        const id = f.replace('.jsonl', '');
        const cmd = 'claude --resume ' + id;
        navigator.clipboard.writeText(cmd);
        toast.success('Copied resume command: ' + cmd);
      },
    },
    {
      label: 'Export Markdown',
      icon: <FileText className="h-4 w-4 text-info" />,
      disabled: busy,
      onAct: async (f) => {
        if (!row.live) return;
        try {
          const md = await exportMd.mutateAsync({ dirName: row.live.dirName, sessionFile: f });
          const blob = new Blob([md], { type: 'text/markdown' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = f.replace('.jsonl', '') + '.md';
          a.click();
          URL.revokeObjectURL(url);
          toast.success('Transcript exported to Markdown');
        } catch (e: unknown) {
          const err = e as Error;
          toast.error('Export failed: ' + err.message);
        }
      },
    },
    {
      label: 'Context Analysis',
      icon: <Brain className="h-4 w-4 text-info" />,
      disabled: busy,
      onAct: (f) => setInspectContextFile(f),
    },
    {
      label: 'Archive',
      icon: <Archive className="h-4 w-4" />,
      disabled: busy,
      onAct: (f) => void doArchive([f]),
    },
    {
      label: 'Delete',
      icon: <Trash2 className="h-4 w-4" />,
      danger: true,
      disabled: busy,
      onAct: (f) => void doDeleteLive([f]),
    },
  ];
  const archActions: RowAction[] = [
    {
      label: 'Restore',
      icon: <ArchiveRestore className="h-4 w-4" />,
      disabled: busy || !canRestore,
      title: !canRestore ? 'Original project no longer exists' : undefined,
      onAct: (f) => void doRestore([f]),
    },
    {
      label: 'Delete',
      icon: <Trash2 className="h-4 w-4" />,
      danger: true,
      disabled: busy,
      onAct: (f) => void doDeleteArchived([f]),
    },
  ];

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl shadow-edge glass">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-hairline px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-semibold text-fg">{row.displayName}</h2>
          <p className="selectable truncate font-mono text-xs text-fg-subtle">{row.subtitle}</p>
        </div>
        <dl className="flex shrink-0 flex-wrap gap-x-6 gap-y-2 text-right">
          <Stat label="Live" value={String(row.live?.sessions ?? 0)} />
          <Stat label="Archived" value={String(archChats.length)} />
          <Stat
            label="On disk"
            value={formatBytes((row.live?.totalBytes ?? 0) + (row.archived?.totalBytes ?? 0))}
            hint={
              row.live?.cacheBytes != null
                ? `+ ${formatBytes(row.live.cacheBytes)} VS Code cache`
                : undefined
            }
          />
          {usage.data && (
            <Stat
              label="Est. spend"
              value={`$${usage.data.estimatedCostUsd.toFixed(2)}`}
              hint={`${Math.round((usage.data.inputTokens + usage.data.outputTokens) / 1000)}k tokens (estimated from list prices)`}
              tone="success"
            />
          )}
        </dl>
      </header>

      {/* Live chats — filter by age, select, archive. */}
      {row.live && (
        <div className={cn('flex flex-col', shownLive.length > 0 && 'min-h-0 flex-1')}>
          {/* Fixed height: the right side swaps between the filter and the
              selection toolbar — the header must never change size. */}
          <div className="flex h-14 shrink-0 items-center gap-2 overflow-hidden border-b border-hairline bg-list px-5">
            <Checkbox
              checked={allLiveSelected}
              onChange={toggleAllLive}
              ariaLabel="Select all live chats"
              disabled={shownLive.length === 0}
            />
            <h3 className="text-xs font-semibold text-fg tabular-nums">
              Live chats ·{' '}
              {filter === 'all' ? liveChats.length : `${shownLive.length} of ${liveChats.length}`}
            </h3>
            <div className="ml-auto flex items-center gap-2">
              {selLive.size > 0 ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => void doArchive([...selLive])}
                  >
                    <Archive className="h-4 w-4" />
                    Archive {selLive.size}
                  </Button>
                  <Button
                    variant="dangerOutline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void doDeleteLive([...selLive])}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete {selLive.size}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelLive(new Set())}>
                    Clear
                  </Button>
                </>
              ) : (
                <>
                  <SegmentedControl
                    value={filter}
                    options={[...FILTERS]}
                    onChange={setFilter}
                    ariaLabel="Show chats older than"
                  />
                  {filter !== 'all' && shownLive.length > 0 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => void doCutoffArchive()}
                    >
                      <Archive className="h-4 w-4" />
                      Archive {shownLive.length}…
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
          {liveQuery.isPending ? (
            <div aria-hidden className="space-y-3 p-4">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="h-4 animate-pulse rounded bg-list" />
              ))}
            </div>
          ) : shownLive.length === 0 ? (
            <p className="px-5 py-4 text-sm text-fg-muted">
              {liveChats.length === 0 ? 'No live chats.' : `No chats older than ${filter} days.`}
            </p>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ChatRows
                chats={shownLive}
                selected={selLive}
                onToggle={(f) => setSelLive((s) => toggleIn(s, f))}
                actions={liveActions}
              />
            </div>
          )}
        </div>
      )}

      {/* Archived — restore or permanently delete. */}
      <div
        className={cn(
          'flex flex-col border-t border-hairline',
          archChats.length > 0 && 'min-h-0 flex-1',
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 overflow-hidden border-b border-hairline bg-list px-5">
          <Checkbox
            checked={allArchSelected}
            onChange={toggleAllArch}
            ariaLabel="Select all archived chats"
            disabled={archChats.length === 0}
          />
          <h3 className="text-xs font-semibold text-fg tabular-nums">
            Archived · {archChats.length}
          </h3>
          {selArch.size > 0 && (
            <div className="ml-auto flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={busy || !canRestore}
                title={!canRestore ? 'Original project no longer exists' : undefined}
                onClick={() => void doRestore([...selArch])}
              >
                <ArchiveRestore className="h-4 w-4" />
                Restore {selArch.size}
              </Button>
              <Button
                variant="dangerOutline"
                size="sm"
                disabled={busy}
                onClick={() => void doDeleteArchived([...selArch])}
              >
                <Trash2 className="h-4 w-4" />
                Delete {selArch.size}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelArch(new Set())}>
                Clear
              </Button>
            </div>
          )}
        </div>
        {archChats.length === 0 ? (
          <p className="px-5 py-4 text-sm text-fg-muted">
            Nothing archived yet
            {row.live && liveChats.length > 0 ? ' — select live chats above to archive them.' : '.'}
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ChatRows
              chats={archChats}
              selected={selArch}
              onToggle={(f) => setSelArch((s) => toggleIn(s, f))}
              actions={archActions}
            />
          </div>
        )}
      </div>

      {inspectContextFile && row.live && (
        <ContextAnalysisModal
          dirName={row.live.dirName}
          sessionFile={inspectContextFile}
          onClose={() => setInspectContextFile(null)}
        />
      )}
    </section>
  );
};

const Stat = ({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'success';
}) => (
  <div className="flex flex-col items-end" title={hint}>
    <dt className="text-[11px] font-medium text-fg-subtle">{label}</dt>
    <dd
      className={cn(
        'font-mono text-sm font-semibold tabular-nums',
        tone === 'success' ? 'text-success' : 'text-fg',
      )}
    >
      {value}
    </dd>
  </div>
);
