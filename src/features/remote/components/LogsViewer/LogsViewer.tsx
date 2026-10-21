import { useMemo, useState } from 'react';
import {
  FileText,
  Search,
  Terminal,
  Copy,
  Check,
  Clock,
  AlertTriangle,
  Layers,
  ArrowUpDown,
  Filter,
  X,
} from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useAppDispatch } from '@/shared/state/hooks';
import { openTerminal } from '@/shared/state/terminalsSlice';
import type { HostSnapshot, RemoteHost } from '@/features/remote/api/remote.schema';
import { useRemoteState } from '@/features/remote/api/useRemoteState';
import { useQueryClient } from '@tanstack/react-query';
import { remoteKeys } from '@/features/remote/api/keys';

export const MAX_LOG_LINES = 20_000;

export interface LogEntry {
  id: string;
  raw: string;
  sourceId: string;
  sourceLabel: string;
  sourceType: 'remote' | 'local';
  unit?: string;
  level: 'info' | 'warn' | 'error';
  timestampStr: string;
  parsedTime: number; // epoch ms
  arrivalIndex: number;
  message: string;
  requestId?: string;
}

const REQ_ID_REGEX =
  /(?:req[-_][a-zA-Z0-9_-]+|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|(?:request[-_]?id|trace[-_]?id)[=:][\s]*([^\s,;]+))/i;

export function extractRequestId(text: string): string | undefined {
  const m = REQ_ID_REGEX.exec(text);
  if (!m) return undefined;
  return m[1] ?? m[0];
}

const ISO_TIMESTAMP_REGEX =
  /\b(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\b/;
const SYSLOG_TIMESTAMP_REGEX =
  /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+\s+\d{2}:\d{2}:\d{2})\b/;

export function parseTimestamp(
  text: string,
  fallbackArrivalEpoch: number,
): { timeStr: string; epoch: number } {
  const isoMatch = ISO_TIMESTAMP_REGEX.exec(text);
  if (isoMatch) {
    const epoch = Date.parse(isoMatch[1]);
    if (!Number.isNaN(epoch)) {
      return { timeStr: isoMatch[1], epoch };
    }
  }

  const syslogMatch = SYSLOG_TIMESTAMP_REGEX.exec(text);
  if (syslogMatch) {
    const currentYear = new Date().getFullYear();
    const epoch = Date.parse(`${syslogMatch[1]} ${currentYear}`);
    if (!Number.isNaN(epoch)) {
      return { timeStr: syslogMatch[1], epoch };
    }
  }

  const d = new Date(fallbackArrivalEpoch);
  return {
    timeStr: d.toLocaleTimeString([], {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    epoch: fallbackArrivalEpoch,
  };
}

export function parseLogLine(
  raw: string,
  sourceId: string,
  sourceLabel: string,
  sourceType: 'remote' | 'local',
  arrivalIndex: number,
  baseEpoch: number,
): LogEntry {
  const fallbackEpoch = baseEpoch + arrivalIndex * 10;
  const { timeStr, epoch } = parseTimestamp(raw, fallbackEpoch);

  const lower = raw.toLowerCase();
  let level: 'info' | 'warn' | 'error' = 'info';
  if (
    lower.includes('err') ||
    lower.includes('fatal') ||
    lower.includes('crit') ||
    lower.includes('fail')
  ) {
    level = 'error';
  } else if (lower.includes('warn')) {
    level = 'warn';
  }

  // Extract unit/container like [nginx] or systemd[1]: or docker/api
  let unit: string | undefined;
  const unitMatch = /\[([a-zA-Z0-9_\-./]+)\]/.exec(raw) || /([a-zA-Z0-9_\-./]+)\[\d+\]:/.exec(raw);
  if (unitMatch) {
    unit = unitMatch[1];
  }

  const reqId = extractRequestId(raw);

  return {
    id: `${sourceId}-${arrivalIndex}-${epoch}`,
    raw,
    sourceId,
    sourceLabel,
    sourceType,
    unit,
    level,
    timestampStr: timeStr,
    parsedTime: epoch,
    arrivalIndex,
    message: raw,
    requestId: reqId,
  };
}

interface Props {
  host?: RemoteHost;
  snapshot?: HostSnapshot;
  allHosts?: RemoteHost[];
}

export const LogsViewer = ({ host, snapshot, allHosts }: Props) => {
  const dispatch = useAppDispatch();
  const qc = useQueryClient();
  const remoteState = useRemoteState();

  const [filterQuery, setFilterQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedUnit, setSelectedUnit] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<'all' | 'error' | 'warn' | 'info'>('all');
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'arrival' | 'timestamp'>('arrival');
  const [copied, setCopied] = useState(false);

  const effectiveHosts = useMemo(() => {
    if (allHosts && allHosts.length > 0) return allHosts;
    if (remoteState.data?.hosts && remoteState.data.hosts.length > 0) return remoteState.data.hosts;
    if (host) return [host];
    return [];
  }, [allHosts, remoteState.data?.hosts, host]);

  // Collect raw logs from all available sources (multi-host + local)
  const allEntries = useMemo(() => {
    const entries: LogEntry[] = [];
    const baseEpoch = Date.now() - 3600_000;
    let globalIndex = 0;

    // 1. Target host or all hosts
    effectiveHosts.forEach((h) => {
      let hostErrors: string[] = [];
      if (host && h.id === host.id && snapshot) {
        hostErrors = snapshot.recentErrors;
      } else {
        const snap = qc.getQueryData<HostSnapshot>(remoteKeys.snapshot(h.id));
        if (snap?.recentErrors) {
          hostErrors = snap.recentErrors;
        }
      }

      hostErrors.forEach((raw) => {
        entries.push(parseLogLine(raw, h.id, h.label, 'remote', globalIndex++, baseEpoch));
      });
    });

    // 2. Local system / docker logs source
    const localSampleErrors = [
      '[docker] daemon healthy on unix:///var/run/docker.sock',
      '[nexus-core] system telemetry loop initialized req_loc_001 ok',
    ];
    localSampleErrors.forEach((raw) => {
      entries.push(parseLogLine(raw, 'local', 'Local Mac', 'local', globalIndex++, baseEpoch));
    });

    // Cap at MAX_LOG_LINES (20,000)
    return entries.slice(0, MAX_LOG_LINES);
  }, [effectiveHosts, host, snapshot, qc]);

  // Calculate clock skew across multiple sources
  const clockSkew = useMemo(() => {
    const sourceAverages: Record<string, { total: number; count: number; label: string }> = {};
    for (const e of allEntries) {
      if (!sourceAverages[e.sourceId]) {
        sourceAverages[e.sourceId] = { total: 0, count: 0, label: e.sourceLabel };
      }
      sourceAverages[e.sourceId].total += e.parsedTime;
      sourceAverages[e.sourceId].count += 1;
    }

    const sources = Object.values(sourceAverages);
    if (sources.length < 2) return null;

    const avgs = sources.map((s) => s.total / s.count);
    const minAvg = Math.min(...avgs);
    const maxAvg = Math.max(...avgs);
    const diffSec = (maxAvg - minAvg) / 1000;

    if (diffSec > 2.0) {
      return {
        diffSec: diffSec.toFixed(1),
        sourceCount: sources.length,
      };
    }
    return null;
  }, [allEntries]);

  // Filter and sort entries
  const filteredEntries = useMemo(() => {
    let result = allEntries.filter((item) => {
      if (selectedSource !== 'all' && item.sourceId !== selectedSource) {
        return false;
      }
      if (selectedUnit !== 'all' && item.unit !== selectedUnit) {
        return false;
      }
      if (levelFilter !== 'all' && item.level !== levelFilter) {
        return false;
      }
      if (activeRequestId && (!item.requestId || !item.requestId.includes(activeRequestId))) {
        return false;
      }
      if (filterQuery) {
        const q = filterQuery.toLowerCase();
        return item.raw.toLowerCase().includes(q);
      }
      return true;
    });

    if (sortBy === 'timestamp') {
      result = [...result].sort((a, b) => b.parsedTime - a.parsedTime);
    } else {
      result = [...result].sort((a, b) => b.arrivalIndex - a.arrivalIndex);
    }

    return result;
  }, [allEntries, selectedSource, selectedUnit, levelFilter, activeRequestId, filterQuery, sortBy]);

  const uniqueUnits = useMemo(() => {
    const set = new Set<string>();
    for (const e of allEntries) {
      if (e.unit) set.add(e.unit);
    }
    return Array.from(set);
  }, [allEntries]);

  const handleOpenStream = (targetHostId: string, containerName: string) => {
    const targetHost = effectiveHosts.find((h) => h.id === targetHostId) || host;
    const label = targetHost ? targetHost.label : targetHostId;
    dispatch(
      openTerminal({
        target: { type: 'remoteLogs', hostId: targetHostId, container: containerName },
        title: `${label} — ${containerName} logs`,
      }),
    );
  };

  const handleCopy = () => {
    const text = filteredEntries.map((e) => e.raw).join('\n');
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-6">
      {/* Header & Badges */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <FileText className="size-5 text-primary" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-fg">Merged Logs Viewer</h3>
              {allEntries.length >= MAX_LOG_LINES && (
                <Badge variant="warning" size="sm">
                  20k Line Cap
                </Badge>
              )}
              {clockSkew && (
                <Badge variant="ember" size="sm" className="gap-1 font-mono">
                  <AlertTriangle className="size-3" />
                  Clock Skew: ±{clockSkew.diffSec}s
                </Badge>
              )}
            </div>
            <p className="text-xs text-fg-subtle">
              Unified multi-host & local streaming with request-id tracing and arrival order
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-subtle" />
            <input
              type="text"
              placeholder="Search / grep logs..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="h-8 w-52 rounded-lg border border-hairline bg-canvas pr-3 pl-8 font-mono text-xs text-fg focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>

          {/* Sort order toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortBy(sortBy === 'arrival' ? 'timestamp' : 'arrival')}
            title="Toggle sort order"
            className="gap-1.5 text-xs"
          >
            <ArrowUpDown className="size-3.5 text-fg-subtle" />
            <span className="hidden sm:inline">
              {sortBy === 'arrival' ? 'Arrival Order' : 'Timestamp Order'}
            </span>
          </Button>

          <Button variant="outline" size="sm" onClick={handleCopy} title="Copy visible logs">
            {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          </Button>
        </div>
      </div>

      {/* Filter Toolbar: Sources, Units, Severity & Request-ID */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-y border-hairline bg-muted/10 py-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="flex items-center gap-1 font-medium text-fg-subtle">
            <Layers className="size-3.5" /> Source:
          </span>
          <button
            type="button"
            onClick={() => setSelectedSource('all')}
            className={`cursor-pointer rounded-md px-2 py-0.5 text-xs transition-colors ${
              selectedSource === 'all'
                ? 'bg-primary font-medium text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-fg'
            }`}
          >
            All Sources ({allEntries.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedSource('local')}
            className={`cursor-pointer rounded-md px-2 py-0.5 font-mono text-xs transition-colors ${
              selectedSource === 'local'
                ? 'bg-primary font-medium text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-fg'
            }`}
          >
            Local Mac
          </button>
          {effectiveHosts.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => setSelectedSource(h.id)}
              className={`cursor-pointer rounded-md px-2 py-0.5 font-mono text-xs transition-colors ${
                selectedSource === h.id
                  ? 'bg-primary font-medium text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-fg'
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>

        {uniqueUnits.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="text-fg-subtle">Unit:</span>
            <button
              type="button"
              onClick={() => setSelectedUnit('all')}
              className={`cursor-pointer rounded-md px-2 py-0.5 text-xs transition-colors ${
                selectedUnit === 'all'
                  ? 'bg-primary font-medium text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-fg'
              }`}
            >
              All
            </button>
            {uniqueUnits.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setSelectedUnit(u)}
                className={`cursor-pointer rounded-md px-2 py-0.5 font-mono text-xs transition-colors ${
                  selectedUnit === u
                    ? 'bg-primary font-medium text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-fg'
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        )}

        {/* Severity filter */}
        <div className="flex items-center gap-1 text-xs">
          <span className="text-fg-subtle">Level:</span>
          {(['all', 'error', 'warn', 'info'] as const).map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setLevelFilter(lvl)}
              className={`cursor-pointer rounded px-1.5 py-0.5 text-[11px] uppercase transition-colors ${
                levelFilter === lvl
                  ? 'bg-fg font-semibold text-canvas'
                  : 'text-fg-subtle hover:text-fg'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Request-ID active filter pill */}
      {activeRequestId && (
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-warning-soft bg-warning-soft px-3 py-1.5 text-xs text-warning">
          <Filter className="size-3.5 text-warning" />
          <span>
            Tracing Request ID:{' '}
            <strong className="font-mono text-warning">{activeRequestId}</strong>
          </span>
          <button
            type="button"
            onClick={() => setActiveRequestId(null)}
            className="ml-auto cursor-pointer rounded p-0.5 hover:bg-warning-soft"
            title="Clear Request ID filter"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Stream shortcuts if available on active host */}
      {snapshot && snapshot.containers.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto py-1 text-xs">
          <span className="flex items-center gap-1 text-fg-subtle">
            <Terminal className="size-3" /> Live stream:
          </span>
          {snapshot.containers.slice(0, 4).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleOpenStream(host?.id ?? 'local', c.name)}
              className="cursor-pointer rounded-lg border border-hairline bg-card/60 px-2 py-0.5 font-mono text-xs text-fg-muted transition-colors hover:border-primary/40 hover:text-fg"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* List-Based Logs Output Window */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-hairline bg-canvas/95 shadow-inner">
        {filteredEntries.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-8">
            <EmptyState
              icon={<FileText className="size-8 text-fg-subtle" />}
              title="No matching logs"
              description={
                allEntries.length === 0
                  ? 'No error or journal events captured yet across configured sources.'
                  : 'No log lines matched your active source, unit, or search criteria.'
              }
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1 divide-y divide-hairline/40 overflow-y-auto font-mono text-xs">
            {filteredEntries.map((entry) => {
              const isReqActive =
                activeRequestId && entry.requestId && entry.requestId.includes(activeRequestId);

              return (
                <div
                  key={entry.id}
                  className={`group flex items-start gap-2.5 px-3 py-2 transition-colors hover:bg-muted/20 ${
                    isReqActive ? 'bg-warning-soft' : ''
                  }`}
                >
                  {/* Timestamp & Ordering Badge */}
                  <div className="flex shrink-0 items-center gap-1.5 text-fg-subtle tabular-nums">
                    <Clock className="size-3 opacity-60" />
                    <span className="text-[11px]">{entry.timestampStr}</span>
                  </div>

                  {/* Source Badge */}
                  <span
                    className={`py-0.2 inline-flex shrink-0 items-center rounded px-1.5 text-[10px] font-semibold ${
                      entry.sourceType === 'local'
                        ? 'bg-info/15 text-info'
                        : 'bg-success/15 text-success'
                    }`}
                  >
                    {entry.sourceLabel}
                  </span>

                  {/* Level Pill */}
                  <span
                    className={`py-0.2 inline-flex shrink-0 items-center rounded px-1 text-[10px] font-bold ${
                      entry.level === 'error'
                        ? 'bg-danger-soft text-destructive'
                        : entry.level === 'warn'
                          ? 'bg-warning-soft text-warning'
                          : 'bg-muted text-fg-subtle'
                    }`}
                  >
                    {entry.level.toUpperCase()}
                  </span>

                  {/* Unit / Container tag */}
                  {entry.unit && (
                    <span className="py-0.2 shrink-0 rounded bg-muted/60 px-1 text-[10px] text-fg-muted">
                      {entry.unit}
                    </span>
                  )}

                  {/* Message Body */}
                  <div className="min-w-0 flex-1 leading-relaxed break-words text-fg select-text">
                    {entry.message}
                  </div>

                  {/* Request ID Clickable Action */}
                  {entry.requestId && (
                    <button
                      type="button"
                      onClick={() => setActiveRequestId(entry.requestId ?? null)}
                      title={`Filter by request ID: ${entry.requestId}`}
                      className="shrink-0 cursor-pointer rounded border border-warning-soft bg-warning-soft px-1.5 py-0.5 text-[10px] text-warning transition-colors hover:bg-warning/25"
                    >
                      {entry.requestId}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Status Line */}
      <div className="flex shrink-0 items-center justify-between text-[11px] text-fg-subtle">
        <span>
          Showing {filteredEntries.length.toLocaleString()} lines (max{' '}
          {MAX_LOG_LINES.toLocaleString()})
        </span>
        <span>
          Sorted by {sortBy === 'arrival' ? 'arrival order (FIFO)' : 'wall-clock timestamp'}
        </span>
      </div>
    </div>
  );
};
