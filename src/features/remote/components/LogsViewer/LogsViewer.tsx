import { useState } from 'react';
import { FileText, Search, Terminal, Copy, Check } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useAppDispatch } from '@/shared/state/hooks';
import { openTerminal } from '@/shared/state/terminalsSlice';
import type { HostSnapshot, RemoteHost } from '@/features/remote/api/remote.schema';

interface Props {
  host: RemoteHost;
  snapshot: HostSnapshot;
}

export const LogsViewer = ({ host, snapshot }: Props) => {
  const dispatch = useAppDispatch();
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedContainer, setSelectedContainer] = useState<string | 'all'>('all');
  const [copied, setCopied] = useState(false);

  const handleOpenStream = (containerName: string) => {
    dispatch(
      openTerminal({
        target: { type: 'remoteLogs', hostId: host.id, container: containerName },
        title: `${host.label} — ${containerName} logs`,
      }),
    );
  };

  const allLogs = snapshot.recentErrors;
  const filteredLogs = allLogs.filter((line) => {
    if (
      selectedContainer !== 'all' &&
      !line.toLowerCase().includes(selectedContainer.toLowerCase())
    ) {
      return false;
    }
    if (filterQuery && !line.toLowerCase().includes(filterQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  const handleCopy = () => {
    void navigator.clipboard.writeText(filteredLogs.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-6">
      {/* Logs Header & Filters */}
      <div className="flex shrink-0 items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FileText className="size-5 text-primary" />
          <div>
            <h3 className="font-semibold text-fg">Aggregated Host Logs</h3>
            <p className="text-xs text-fg-subtle">
              Systemd journals and recent container error streams on {host.label}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick search */}
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-subtle" />
            <input
              type="text"
              placeholder="Filter log lines..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="h-8 w-48 rounded-lg border border-hairline bg-canvas pr-3 pl-8 font-mono text-xs text-fg focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>

          <Button variant="outline" size="sm" onClick={handleCopy} title="Copy visible logs">
            {copied ? (
              <Check className="size-3.5 text-emerald-500" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Container filter & live stream shortcuts */}
      {snapshot.containers.length > 0 && (
        <div className="flex shrink-0 items-center justify-between gap-4 overflow-x-auto py-1">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-fg-subtle">Filter:</span>
            <button
              type="button"
              onClick={() => setSelectedContainer('all')}
              className={`cursor-pointer rounded-md px-2 py-0.5 text-xs transition-colors ${
                selectedContainer === 'all'
                  ? 'bg-primary font-medium text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              All
            </button>
            {snapshot.containers.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedContainer(c.name)}
                className={`cursor-pointer rounded-md px-2 py-0.5 font-mono text-xs transition-colors ${
                  selectedContainer === c.name
                    ? 'bg-primary font-medium text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-fg-subtle">
              <Terminal className="size-3" /> Live stream:
            </span>
            {snapshot.containers.slice(0, 3).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleOpenStream(c.name)}
                className="bg-surface/60 cursor-pointer rounded-lg border border-hairline px-2 py-0.5 font-mono text-xs text-fg-muted transition-colors hover:border-primary/40 hover:text-fg"
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Logs Output Window */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-hairline bg-canvas/90 shadow-sm backdrop-blur-sm">
        {filteredLogs.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-8">
            <EmptyState
              icon={<FileText className="h-8 w-8 text-fg-subtle" />}
              title="No matching logs"
              description={
                allLogs.length === 0
                  ? 'No error or warning events recorded in the last hour.'
                  : 'No log lines matched your active filter.'
              }
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-fg-muted select-text">
            {filteredLogs.map((line, idx) => (
              <div key={idx} className="rounded px-2 py-0.5 transition-colors hover:bg-muted/30">
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
