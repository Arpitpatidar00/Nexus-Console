import { useLayoutEffect, useRef, useState } from 'react';
import { Check, Copy, Radio, RotateCw, ScrollText, Search, TerminalSquare, X } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useAppDispatch } from '@/shared/state/hooks';
import { openTerminal } from '@/shared/state/terminalsSlice';
import { Button } from '@/shared/ui/Button';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { Switch } from '@/shared/ui/Switch';
import type { Container, HostSnapshot, RemoteHost } from '@/features/remote/api/remote.schema';
import { useContainerLogs } from '@/features/remote/api/useContainerLogs';
import {
  entriesOf,
  filterEntries,
  journalEntriesOf,
  type LevelFilter,
  type LogEntry,
  type LogLevel,
} from '@/features/remote/utils/logs';

const JOURNAL = '__journal__';
const TAILS = [200, 1000, 5000] as const;

const LEVEL_STYLE: Record<LogLevel, { bar: string; text: string; label: string }> = {
  error: { bar: 'bg-destructive', text: 'text-destructive', label: 'ERR' },
  warn: { bar: 'bg-warning', text: 'text-warning', label: 'WRN' },
  info: { bar: 'bg-transparent', text: 'text-muted-foreground', label: '' },
  debug: { bar: 'bg-transparent', text: 'text-muted-foreground/70', label: '' },
};

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

/** `fameo-dev-fameo-backend-1` under the `fameo-dev` stack reads as `fameo-backend`. */
const shortName = (c: Container) => {
  let n = c.name;
  if (c.composeProject && n.startsWith(`${c.composeProject}-`))
    n = n.slice(c.composeProject.length + 1);
  return n.replace(/-\d+$/, '');
};

const dotOf = (c: Container) =>
  c.state === 'restarting' || c.health === 'unhealthy'
    ? 'bg-destructive'
    : c.state !== 'running'
      ? 'bg-muted-foreground'
      : c.health === 'starting'
        ? 'bg-warning'
        : 'bg-success';

/** Containers grouped by compose stack (dev and staging apart), loose ones last. */
function groupsOf(containers: Container[]) {
  const map = new Map<string, Container[]>();
  for (const c of containers) {
    const k = c.composeProject ?? '';
    map.set(k, [...(map.get(k) ?? []), c]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
    .map(([name, items]) => ({
      name,
      items: items.sort((a, b) => shortName(a).localeCompare(shortName(b))),
    }));
}

const SourceButton = ({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-pressed={active}
    className={cn(
      'flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
      active ? 'bg-accent text-fg' : 'text-muted-foreground hover:bg-accent hover:text-fg',
    )}
  >
    {children}
  </button>
);

/** Message text with request ids clickable (they filter to that request). */
const Message = ({ e, onTrace }: { e: LogEntry; onTrace: (id: string) => void }) => {
  if (!e.requestId) return <>{e.text}</>;
  const i = e.text.indexOf(e.requestId);
  return (
    <>
      {e.text.slice(0, i)}
      <button
        type="button"
        onClick={() => onTrace(e.requestId!)}
        title="Show only this request"
        className="cursor-pointer rounded text-info underline decoration-dotted underline-offset-2 hover:decoration-solid"
      >
        {e.requestId}
      </button>
      {e.text.slice(i + e.requestId.length)}
    </>
  );
};

interface Props {
  host: RemoteHost;
  snapshot: HostSnapshot;
}

export const LogsViewer = ({ host, snapshot }: Props) => {
  const dispatch = useAppDispatch();
  const groups = groupsOf(snapshot.containers);
  const firstRunning =
    snapshot.containers.find((c) => c.state === 'running') ?? snapshot.containers[0];
  const [source, setSource] = useState<string>(firstRunning?.name ?? JOURNAL);
  const [tail, setTail] = useState<number>(TAILS[0]);
  const [live, setLive] = useState(false);
  const [level, setLevel] = useState<LevelFilter>('all');
  const [hideNoise, setHideNoise] = useState(true);
  const [wrap, setWrap] = useState(true);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);

  // The selected container can vanish between checks (redeploys rename them).
  const container = snapshot.containers.find((c) => c.name === source) ?? null;
  const isJournal = source === JOURNAL || !container;
  const logs = useContainerLogs(host.id, isJournal ? null : container.name, tail, live);

  const all: LogEntry[] = isJournal
    ? journalEntriesOf(snapshot.recentErrors)
    : entriesOf(logs.data?.lines ?? []);
  const shown = filterEntries(all, { level, hideNoise, query });
  const hiddenNoise = hideNoise ? all.filter((e) => e.noise).length : 0;
  const counts = {
    error: all.filter((e) => e.level === 'error').length,
    warn: all.filter((e) => e.level === 'warn').length,
  };

  // Newest is at the bottom, like a terminal: stay pinned there unless the
  // user scrolled up to read something.
  const listRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  // A new source starts pinned to its newest line.
  const pickSource = (name: string) => {
    pinned.current = true;
    setSource(name);
  };
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  });

  const follow = () =>
    container &&
    dispatch(
      openTerminal({
        target: { type: 'remoteLogs', hostId: host.id, container: container.name },
        title: `${host.label} · ${shortName(container)} logs`,
      }),
    );

  const copy = () => {
    void navigator.clipboard.writeText(shown.map((e) => e.text).join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex min-h-0 flex-1">
      {/* Sources */}
      <nav
        aria-label="Log sources"
        className="w-56 shrink-0 overflow-y-auto border-r border-hairline px-3 py-4"
      >
        {groups.length === 0 && (
          <p className="px-2 pb-3 text-xs text-muted-foreground">
            {snapshot.docker.state === 'noPermission'
              ? 'Docker isn’t readable for your SSH user, so container logs aren’t available.'
              : 'No containers on this server.'}
          </p>
        )}
        {groups.map((g) => (
          <div key={g.name || '(none)'} className="mb-4">
            <p
              className="truncate px-2 pb-1 text-xs font-medium text-muted-foreground"
              title={g.name || undefined}
            >
              {g.name || 'Other containers'}
            </p>
            {g.items.map((c) => (
              <SourceButton
                key={c.id}
                active={source === c.name}
                onClick={() => pickSource(c.name)}
                title={`${c.name} · ${c.status}`}
              >
                <span className={cn('size-1.5 shrink-0 rounded-full', dotOf(c))} aria-hidden />
                <span className="min-w-0 truncate font-mono text-xs">{shortName(c)}</span>
              </SourceButton>
            ))}
          </div>
        ))}
        <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">System</p>
        <SourceButton active={isJournal} onClick={() => pickSource(JOURNAL)}>
          <ScrollText className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">Journal errors</span>
          <span className="text-xs tabular-nums">{snapshot.recentErrors.length}</span>
        </SourceButton>
      </nav>

      {/* Viewer */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-hairline px-4 py-2.5">
          <label className="flex h-8 min-w-0 flex-1 basis-48 items-center gap-2 rounded-full border border-hairline bg-muted px-3 focus-within:ring-2 focus-within:ring-ring">
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search these lines"
              aria-label="Search log lines"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="cursor-pointer text-muted-foreground hover:text-fg"
              >
                <X className="size-3.5" />
              </button>
            )}
          </label>
          <SegmentedControl<LevelFilter>
            ariaLabel="Levels"
            value={level}
            onChange={setLevel}
            options={[
              { value: 'all', label: 'All' },
              {
                value: 'warn',
                label: `Warnings${counts.warn + counts.error ? ` · ${counts.warn + counts.error}` : ''}`,
              },
              { value: 'error', label: `Errors${counts.error ? ` · ${counts.error}` : ''}` },
            ]}
          />
          {!isJournal && (
            <>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  id="logs-live"
                  checked={live}
                  onChange={setLive}
                  ariaLabel="Live: reload every 3 seconds"
                />
                <label htmlFor="logs-live" className="flex cursor-pointer items-center gap-1">
                  <Radio className={cn('size-3.5', live && 'text-success')} aria-hidden />
                  Live
                </label>
              </span>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label="Reload"
                title="Reload"
                disabled={logs.isFetching}
                onClick={() => void logs.refetch()}
              >
                <RotateCw
                  className={cn(logs.isFetching && 'animate-spin motion-reduce:animate-none')}
                />
              </Button>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label="Follow in a terminal"
                title="Follow in a terminal (docker logs -f)"
                onClick={follow}
              >
                <TerminalSquare />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Copy shown lines"
            title="Copy shown lines"
            onClick={copy}
            disabled={shown.length === 0}
          >
            {copied ? <Check className="text-success" /> : <Copy />}
          </Button>
        </div>

        {/* Secondary row: what's shown, and the quieter switches */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-hairline px-4 py-1.5 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {shown.length.toLocaleString()} of {all.length.toLocaleString()}{' '}
            {isJournal ? 'journal errors from the last hour' : 'entries'}
            {!isJournal && logs.dataUpdatedAt > 0 && <> · read {clock(logs.dataUpdatedAt)}</>}
          </span>
          {!isJournal && (
            <label className="flex items-center gap-1.5">
              Last
              <select
                value={tail}
                onChange={(e) => setTail(Number(e.target.value))}
                className="cursor-pointer rounded border border-hairline bg-muted px-1 py-0.5 text-xs text-fg"
              >
                {TAILS.map((t) => (
                  <option key={t} value={t}>
                    {t.toLocaleString()}
                  </option>
                ))}
              </select>
              lines
            </label>
          )}
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={hideNoise}
              onChange={(e) => setHideNoise(e.target.checked)}
              className="accent-ember"
            />
            Hide health checks & SQL{hiddenNoise > 0 && ` (${hiddenNoise})`}
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={wrap}
              onChange={(e) => setWrap(e.target.checked)}
              className="accent-ember"
            />
            Wrap lines
          </label>
        </div>

        {!isJournal && logs.error ? (
          <div className="px-4 py-4">
            <ErrorPanel
              error={logs.error}
              fallback="Couldn't read this container's log"
              onRetry={() => void logs.refetch()}
            />
          </div>
        ) : !isJournal && logs.isLoading ? (
          <div aria-hidden className="space-y-2 px-4 py-4">
            {Array.from({ length: 10 }, (_, i) => (
              <div
                key={i}
                className="h-4 animate-pulse rounded bg-muted"
                style={{ width: `${55 + ((i * 37) % 40)}%` }}
              />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {all.length === 0
              ? isJournal
                ? 'No system errors in the last hour.'
                : 'This container hasn’t logged anything yet.'
              : 'No lines match. Try All levels, or clear the search.'}
          </p>
        ) : (
          <div
            ref={listRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
            }}
            className="min-h-0 flex-1 overflow-auto py-1 font-mono text-xs leading-5"
            role="log"
            aria-live={live ? 'polite' : 'off'}
          >
            {shown.map((e) => {
              const st = LEVEL_STYLE[e.level];
              return (
                <div key={e.key} className="group flex min-w-0 hover:bg-accent">
                  <span className={cn('w-0.5 shrink-0', st.bar)} aria-hidden />
                  <span
                    className="w-[4.5rem] shrink-0 pl-3 text-muted-foreground tabular-nums select-none"
                    title={e.at ? new Date(e.at).toString() : undefined}
                  >
                    {e.at ? clock(e.at) : ''}
                  </span>
                  <span className={cn('w-8 shrink-0 font-semibold select-none', st.text)}>
                    {st.label}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 pr-4',
                      wrap ? 'break-words whitespace-pre-wrap' : 'whitespace-pre',
                      e.level === 'debug' ? 'text-muted-foreground' : 'text-fg',
                    )}
                  >
                    <Message e={e} onTrace={setQuery} />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
