import { useState } from 'react';
import { Copy, Inbox, Play, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/Button';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Input, Select } from '@/shared/ui/Field';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { Spinner } from '@/shared/ui/Spinner';
import { useKafkaConsume } from '../../api/useKafka';
import type { ConsumeRequest, ConsumeResult } from '../../api/kafka.schema';
import { fromLocalInput, messageToJson, toLocalInput } from '../../utils/format';
import { MessageRow } from '../MessageRow';
import { Warnings } from '../Warnings';

type Mode = 'latest' | 'earliest' | 'offset' | 'timestamp';
const LIMITS = [20, 50, 100, 200, 500];

interface MessageBrowserProps {
  clusterId: string;
  topic: string;
  partitions: number[];
}

/** Why the list is empty, in terms of what was asked. */
function emptyReason(r: ConsumeResult, req: ConsumeRequest): string {
  const ranges = r.partitions.filter((p) => !p.error);
  if (ranges.length > 0 && ranges.every((p) => p.low === p.high)) {
    return 'No messages — the partitions read are empty (or everything expired under retention).';
  }
  if (req.search) return `Nothing in the messages looked at contains “${req.search}”.`;
  if (req.start.kind === 'timestamp') return 'No messages at or after that time.';
  if (req.start.kind === 'offset') return 'No messages at or after that offset.';
  return 'No messages.';
}

export const MessageBrowser = ({ clusterId, topic, partitions }: MessageBrowserProps) => {
  const [partition, setPartition] = useState<string>('all');
  const [mode, setMode] = useState<Mode>('latest');
  const [offset, setOffset] = useState('0');
  const [time, setTime] = useState(() => toLocalInput(Date.now() - 60 * 60 * 1000));
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState('');
  // Newest 50 on open: reading is safe and it's what people open a topic for.
  const [request, setRequest] = useState<ConsumeRequest | null>({
    topic,
    partitions: null,
    start: { kind: 'latest' },
    limit: 50,
    search: null,
  });
  const [run, setRun] = useState(0);
  const q = useKafkaConsume(clusterId, request, run);

  const ts = fromLocalInput(time);
  const offsetNum = /^\d+$/.test(offset) ? Number(offset) : null;
  const invalid =
    (mode === 'offset' && (offsetNum === null || !Number.isSafeInteger(offsetNum))) ||
    (mode === 'timestamp' && ts === null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    setRequest({
      topic,
      partitions: partition === 'all' ? null : [Number(partition)],
      start:
        mode === 'offset'
          ? { kind: 'offset', offset: offsetNum ?? 0 }
          : mode === 'timestamp'
            ? { kind: 'timestamp', timestamp: ts ?? 0 }
            : { kind: mode },
      limit,
      search: search.trim() || null,
    });
    setRun((n) => n + 1);
  };

  const r = q.data;
  const reading = q.isFetching;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        onSubmit={submit}
        className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-2.5"
        aria-label="Read messages"
      >
        <Select
          size="sm"
          aria-label="Partition"
          className="w-36"
          value={partition}
          onChange={(e) => setPartition(e.target.value)}
        >
          <option value="all">All partitions</option>
          {partitions.map((p) => (
            <option key={p} value={p}>
              Partition {p}
            </option>
          ))}
        </Select>
        <SegmentedControl<Mode>
          ariaLabel="Start from"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'latest', label: 'Newest' },
            { value: 'earliest', label: 'Oldest' },
            { value: 'offset', label: 'Offset' },
            { value: 'timestamp', label: 'Time' },
          ]}
        />
        {mode === 'offset' && (
          <Input
            size="sm"
            mono
            inputMode="numeric"
            aria-label="Start offset"
            aria-invalid={invalid || undefined}
            className="w-32"
            value={offset}
            onChange={(e) => setOffset(e.target.value.replace(/\D/g, ''))}
          />
        )}
        {mode === 'timestamp' && (
          <Input
            size="sm"
            type="datetime-local"
            step={1}
            aria-label="Start time"
            aria-invalid={invalid || undefined}
            className="w-56"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        )}
        <Select
          size="sm"
          aria-label="How many"
          className="w-24"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        >
          {LIMITS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
        <Input
          size="sm"
          type="search"
          aria-label="Contains text"
          placeholder="Contains text (key, value, headers)"
          className="min-w-48 flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button type="submit" variant="ember" size="sm" disabled={invalid || reading}>
          {reading ? <Spinner className="size-4" /> : <Play />}
          Read
        </Button>
      </form>

      {q.error ? (
        <div className="p-5">
          <ErrorPanel
            error={q.error}
            fallback="Couldn't read messages"
            onRetry={() => setRun((n) => n + 1)}
          />
        </div>
      ) : !r ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-4" /> Reading…
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[11px] text-muted-foreground">
            <span>
              <span className="font-medium text-fg">{r.messages.length}</span> message
              {r.messages.length === 1 ? '' : 's'}
              {request?.start.kind === 'latest' ? ', newest first' : ', oldest first'}
            </span>
            <span>looked at {r.scanned.toLocaleString('en-US')}</span>
            <span>{r.durationMs} ms</span>
            <details className="relative">
              <summary className="cursor-pointer hover:text-fg">Partition offsets</summary>
              <div className="absolute z-10 mt-1 max-h-72 overflow-auto rounded-lg border border-border bg-popover p-2 shadow-float">
                <table className="text-[11px]">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="px-2 py-1 font-medium">Partition</th>
                      <th className="px-2 py-1 text-right font-medium">Start</th>
                      <th className="px-2 py-1 text-right font-medium">End</th>
                      <th className="px-2 py-1 text-right font-medium">Read from</th>
                      <th className="px-2 py-1 text-right font-medium">Reached</th>
                      <th className="px-2 py-1 font-medium">
                        <span className="sr-only">Error</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-fg">
                    {r.partitions.map((p) => (
                      <tr key={p.partition}>
                        <td className="px-2 py-0.5">{p.partition}</td>
                        <td className="px-2 py-0.5 text-right">{p.low ?? '—'}</td>
                        <td className="px-2 py-0.5 text-right">{p.high ?? '—'}</td>
                        <td className="px-2 py-0.5 text-right">{p.start ?? '—'}</td>
                        <td className="px-2 py-0.5 text-right">{p.reached ?? '—'}</td>
                        <td className="px-2 py-0.5 font-sans text-destructive">{p.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            {r.messages.length > 0 && (
              <button
                type="button"
                className="ml-auto inline-flex cursor-pointer items-center gap-1 hover:text-fg"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    JSON.stringify(r.messages.map(messageToJson), null, 2),
                  );
                  toast.success(`Copied ${r.messages.length} messages as JSON`);
                }}
              >
                <Copy className="size-3" aria-hidden /> Copy all as JSON
              </button>
            )}
          </div>
          {(r.partial || r.warnings.length > 0 || r.partitions.some((p) => p.error)) && (
            <div className="flex flex-col gap-2 px-4 pb-2">
              {r.partial && (
                <p className="flex items-center gap-2 text-xs text-warning">
                  <TriangleAlert className="size-3.5 shrink-0" aria-hidden /> {r.partial}
                </p>
              )}
              <Warnings
                warnings={[
                  ...r.warnings,
                  ...r.partitions
                    .filter((p) => p.error)
                    .map((p) => `Partition ${p.partition}: ${p.error}`),
                ]}
              />
            </div>
          )}
          {r.messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-xs text-muted-foreground">
              <Inbox className="size-6" aria-hidden />
              {request && emptyReason(r, request)}
            </div>
          ) : (
            <ul
              aria-label="Messages"
              aria-busy={reading}
              className="min-h-0 flex-1 overflow-y-auto border-t border-hairline"
            >
              {r.messages.map((m) => (
                <MessageRow key={`${m.partition}:${m.offset}`} message={m} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
};
