import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatBytes, formatDuration } from '@/shared/lib/format';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Sparkline } from '@/shared/ui/Sparkline';
import { useMemory } from '@/features/maclean/api/useMemory';
import type { MemoryReport } from '@/features/maclean/api/maclean.schema';
import { appendMem, memSample, swapState, type MemSample } from '@/features/maclean/utils/memory';
import { Card } from '@/features/maclean/components/Card';
import { UsageBar } from '@/features/maclean/components/UsageBar';

const PRESSURE: Record<MemoryReport['pressure'], { dot: string; label: string; text: string }> = {
  normal: { dot: 'bg-running-dot', label: 'Normal', text: 'Apps have the memory they need.' },
  warning: {
    dot: 'bg-warn-dot',
    label: 'Warning',
    text: 'macOS is compressing memory and using swap to keep up. Quitting an app you aren’t using helps.',
  },
  critical: {
    dot: 'bg-danger-dot',
    label: 'Critical',
    text: 'Memory is exhausted: expect beach balls. Quit the biggest app below.',
  },
  unknown: {
    dot: 'bg-stopped-dot',
    label: 'Unknown',
    text: 'macOS didn’t report memory pressure.',
  },
};

// Shades of the one accent (plus neutral for cache): composition, not status.
const SEGMENTS = [
  { key: 'appBytes', label: 'App memory', cls: 'bg-accent', hint: 'What your apps are using.' },
  {
    key: 'wiredBytes',
    label: 'Wired',
    cls: 'bg-accent/70',
    hint: 'Held by macOS itself; can’t be moved.',
  },
  {
    key: 'compressedBytes',
    label: 'Compressed',
    cls: 'bg-accent/40',
    hint: 'Squeezed in RAM to avoid swapping.',
  },
  {
    key: 'cachedBytes',
    label: 'Cached files',
    cls: 'bg-fg-subtle/40',
    hint: 'Given back instantly when apps need it.',
  },
  { key: 'freeBytes', label: 'Free', cls: 'bg-list', hint: '' },
] as const;

const Composition = ({ m, history }: { m: MemoryReport; history: MemSample[] }) => {
  const c = m.composition;
  const p = PRESSURE[m.pressure];
  return (
    <Card
      title="Memory"
      aside={
        <span className="flex items-center gap-2 text-xs text-fg-muted">
          <Sparkline values={history.map((h) => h.usedPct)} />
          <span className="tabular-nums">
            {formatBytes(c.usedBytes)} used of {formatBytes(c.totalBytes)}
          </span>
        </span>
      }
    >
      <div className="space-y-4 px-5 py-4">
        <p className="flex items-start gap-2 text-sm">
          <span aria-hidden className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', p.dot)} />
          <span>
            <span className="font-semibold text-fg">Pressure: {p.label}.</span>{' '}
            <span className="text-fg-muted">{p.text}</span>
          </span>
        </p>
        <div aria-hidden className="flex h-3 overflow-hidden rounded-full bg-list">
          {SEGMENTS.map((s) => (
            <div
              key={s.key}
              className={cn('h-full', s.cls)}
              style={{ width: `${c.totalBytes ? (c[s.key] * 100) / c.totalBytes : 0}%` }}
            />
          ))}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 lg:grid-cols-5">
          {SEGMENTS.map((s) => (
            <div key={s.key} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs text-fg-muted">
                <span
                  aria-hidden
                  className={cn('h-2 w-2 shrink-0 rounded-sm border border-border', s.cls)}
                />
                {s.label}
              </dt>
              <dd className="text-sm font-medium text-fg tabular-nums">{formatBytes(c[s.key])}</dd>
              {s.hint && <dd className="text-xs text-fg-subtle">{s.hint}</dd>}
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
};

const Swap = ({ m, history }: { m: MemoryReport; history: MemSample[] }) => {
  const state = swapState(m);
  const used = m.swapTotalBytes ? (m.swapUsedBytes * 100) / m.swapTotalBytes : 0;
  return (
    <Card
      title="Swap"
      aside={
        <span className="flex items-center gap-2 text-xs text-fg-muted">
          <Sparkline values={history.map((h) => h.swapPct)} />
          <span className="tabular-nums">
            {formatBytes(m.swapUsedBytes)} of {formatBytes(m.swapTotalBytes)}
          </span>
        </span>
      }
    >
      <div className="space-y-3 px-5 py-4 text-sm">
        <UsageBar pct={used} tone={state === 'active' ? 'warn' : 'neutral'} />
        {state === 'active' ? (
          <p>
            <span className="font-semibold text-warn">Swapping now</span>{' '}
            <span className="text-fg-muted tabular-nums">
              (~{formatBytes(Math.round(m.swapoutBytesPerSec ?? 0))}/s written to disk). This is
              what makes a Mac feel slow: quit something big, or add memory headroom.
            </span>
          </p>
        ) : state === 'leftover' ? (
          <p className="text-fg-muted">
            <span className="font-semibold text-fg">Nothing is being swapped right now.</span> The{' '}
            {formatBytes(m.swapUsedBytes)} in swap is left over from earlier and isn’t slowing you
            down. It clears when you restart.
          </p>
        ) : (
          <p className="text-fg-muted">No swap in use.</p>
        )}
        <p className="text-xs text-fg-subtle tabular-nums">Up {formatDuration(m.uptimeSecs)}</p>
        {m.restartSuggested && (
          <p className="flex items-start gap-2 rounded-lg border border-border bg-canvas px-3 py-2 text-xs text-fg-muted">
            <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Over 2 GB of swap after more than a week up: a restart would give it back.
          </p>
        )}
      </div>
    </Card>
  );
};

const TopApps = ({ m }: { m: MemoryReport }) => {
  const max = m.topApps[0]?.bytes ?? 1;
  return (
    <Card
      title="Using the most memory"
      aside={<span className="text-xs text-fg-subtle">Reported only</span>}
    >
      <ul className="divide-y divide-border">
        {m.topApps.map((a) => (
          <li key={a.name} className="space-y-1.5 px-5 py-2.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-fg">
                {a.name}
                {a.processes > 1 && (
                  <span className="ml-1.5 text-xs text-fg-subtle">{a.processes} processes</span>
                )}
              </span>
              <span className="shrink-0 text-xs text-fg-muted tabular-nums">
                {formatBytes(a.bytes)}
              </span>
            </div>
            <UsageBar pct={(a.bytes * 100) / max} />
          </li>
        ))}
      </ul>
      <p className="border-t border-border px-5 py-2 text-xs text-fg-subtle">
        Resident memory per app. Compressed and swapped pages aren’t included, so the total is
        smaller than Memory used.
      </p>
    </Card>
  );
};

export const MemoryPage = () => {
  const mem = useMemory();
  const [history, setHistory] = useState<MemSample[]>([]);
  const m = mem.data;
  useEffect(() => {
    if (m) setHistory((h) => appendMem(h, memSample(m)));
  }, [m]);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold text-fg">Memory</h1>
        <p className="text-sm text-fg-muted">Live while this tab is open · read-only</p>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[90rem] space-y-4 p-6">
          {mem.isError && !m ? (
            <ErrorPanel
              error={mem.error}
              fallback="Couldn't read memory"
              onRetry={() => void mem.refetch()}
            />
          ) : !m ? (
            <div aria-hidden className="space-y-4">
              <div className="h-44 animate-pulse rounded-xl bg-list" />
              <div className="h-40 animate-pulse rounded-xl bg-list" />
            </div>
          ) : (
            <>
              <Composition m={m} history={history} />
              <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
                <Swap m={m} history={history} />
                <TopApps m={m} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
