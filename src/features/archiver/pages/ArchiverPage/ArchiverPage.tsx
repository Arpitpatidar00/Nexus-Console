import { useState } from 'react';
import { FolderOpen, Settings2 } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Panel } from '@/shared/ui/Panel';
import { formatBytes } from '@/shared/lib/format';
import { useArchivedChats, useClaudeProjects } from '@/features/archiver/api/useArchiver';
import { ArchiveSettingsDialog } from '@/features/archiver/components/ArchiveSettingsDialog';
import { ProjectDetail, type ArchiverRow } from '@/features/archiver/components/ProjectDetail';
import { ArchiverProjectsList } from '@/features/archiver/components/ArchiverProjectsList';

/** Master-detail: projects on the left, the selected project's chats +
 * actions on the right (Smoked Glass pattern). */
export const ArchiverPage = () => {
  const projects = useClaudeProjects();
  const archived = useArchivedChats();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isPending = projects.isPending || archived.isPending;

  const rows: ArchiverRow[] = [
    ...(projects.data ?? []).map((p) => ({
      id: p.dirName,
      displayName: p.displayName,
      subtitle: p.realPath ?? 'original folder not found',
      live: p,
      archived: (archived.data ?? []).find((a) => a.dirName === p.dirName) ?? null,
    })),
    ...(archived.data ?? [])
      .filter((a) => a.dirName == null)
      .map((a) => ({
        id: `orphan:${a.folder}`,
        displayName: a.folder,
        subtitle: 'archive only — original project removed',
        live: null,
        archived: a,
      })),
  ].filter((r) => (r.live?.sessions ?? 0) + (r.archived?.chats.length ?? 0) > 0);

  const active = rows.find((r) => r.id === selectedId) ?? rows[0] ?? null;

  const totalChats = rows.reduce((n, r) => n + (r.live?.sessions ?? 0), 0);
  const archiveBytes = (archived.data ?? []).reduce((n, p) => n + p.totalBytes, 0);
  const subtitle = isPending
    ? 'Claude chat archive'
    : `${rows.length} projects · ${totalChats} live chats · ${formatBytes(archiveBytes)} archived`;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-4">
        <p className="sr-caption tabular-nums">{subtitle}</p>
        <Button
          variant="glass"
          size="sm"
          aria-label="Archive settings"
          title="Archive settings"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings2 className="size-4" />
          Archive Settings
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 md:grid-cols-[340px_1fr]">
        <Panel
          title="Projects"
          subtitle="Claude Code workspace history"
          className="flex min-h-0 flex-col overflow-hidden p-4"
        >
          <ArchiverProjectsList
            rows={rows}
            selectedId={active?.id ?? null}
            isPending={isPending}
            onSelect={setSelectedId}
          />
        </Panel>

        {isPending ? (
          <Panel className="flex min-h-0 flex-col overflow-hidden p-6">
            <div aria-hidden className="space-y-3 p-4">
              <div className="h-5 w-48 animate-pulse rounded bg-muted" />
              <div className="h-4 w-72 animate-pulse rounded bg-muted" />
            </div>
          </Panel>
        ) : active ? (
          <ProjectDetail key={active.id} row={active} />
        ) : (
          <Panel className="flex min-h-0 flex-col overflow-hidden p-6">
            <EmptyState
              icon={<FolderOpen className="size-10" />}
              title="No Claude projects"
              description="Nothing found in ~/.claude/projects on this machine."
            />
          </Panel>
        )}
      </div>

      <ArchiveSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
};
