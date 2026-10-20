import type { ReactNode } from 'react';
import { formatBytes, formatDuration } from '@/shared/lib/format';
import type { HostSnapshot } from '@/features/remote/api/remote.schema';
import { usedPct } from '@/features/remote/utils/health';
import { Meter } from '@/features/remote/components/Meter';
import { Sparkline } from '@/shared/ui/Sparkline';
import type { Sample } from '@/features/remote/utils/history';

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
    <dt className="shrink-0 text-fg-muted">{k}</dt>
    <dd className="min-w-0 truncate text-right text-fg" title={v}>
      {v}
    </dd>
  </div>
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="space-y-3 border-b border-border px-5 py-4 last:border-b-0">
    <h3 className="text-sm font-semibold text-fg">{title}</h3>
    {children}
  </section>
);

export const OverviewPanel = ({
  snapshot: s,
  history,
}: {
  snapshot: HostSnapshot;
  history: Sample[];
}) => {
  const m = s.memory;
  const memUsed = m.totalBytes - m.availableBytes;
  const swapUsed = m.swapTotalBytes - m.swapFreeBytes;
  const pct = (part: number, whole: number) => (whole > 0 ? (part * 100) / whole : null);
  // Load per core: 100% = every core busy on average over 5 minutes.
  const loadPct = s.cpu.cores > 0 ? (s.cpu.load5 * 100) / s.cpu.cores : null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2">
        <div className="border-border lg:border-r">
          <Section title="System">
            <dl className="divide-y divide-border">
              <Row k="Hostname" v={s.system.hostname || '—'} />
              <Row k="OS" v={s.system.os || '—'} />
              <Row
                k="Kernel"
                v={[s.system.kernel, s.system.arch].filter(Boolean).join(' · ') || '—'}
              />
              <Row k="Up" v={formatDuration(s.system.uptimeSecs)} />
              {s.docker.version && <Row k="Docker" v={s.docker.version} />}
              {s.system.rebootRequired && <Row k="Reboot" v="Pending (updates installed)" />}
            </dl>
          </Section>
        </div>
        <div>
          <Section title="CPU & memory">
            <Meter
              label={`CPU · ${s.cpu.cores} core${s.cpu.cores === 1 ? '' : 's'}`}
              pct={s.cpu.usagePct}
              detail={s.cpu.usagePct == null ? 'no data' : `${s.cpu.usagePct.toFixed(1)}%`}
              trend={<Sparkline values={history.map((h) => h.cpuPct)} />}
            />
            <Meter
              label="Load (5 min)"
              pct={loadPct == null ? null : Math.min(100, loadPct)}
              warnAt={100}
              critAt={150}
              detail={`${s.cpu.load1.toFixed(2)} · ${s.cpu.load5.toFixed(2)} · ${s.cpu.load15.toFixed(2)}`}
            />
            <Meter
              label="Memory"
              pct={pct(memUsed, m.totalBytes)}
              warnAt={90}
              critAt={97}
              detail={`${formatBytes(memUsed)} of ${formatBytes(m.totalBytes)}`}
              trend={<Sparkline values={history.map((h) => h.memPct)} />}
            />
            {m.swapTotalBytes > 0 && (
              <Meter
                label="Swap"
                pct={pct(swapUsed, m.swapTotalBytes)}
                warnAt={50}
                critAt={90}
                detail={`${formatBytes(swapUsed)} of ${formatBytes(m.swapTotalBytes)}`}
              />
            )}
          </Section>
        </div>
      </div>
      <Section title="Disks">
        {s.disks.length === 0 ? (
          <p className="text-sm text-fg-muted">No disks reported.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {s.disks.map((d) => (
              <Meter
                key={`${d.fs}${d.mount}`}
                label={d.mount}
                pct={usedPct(d.usedBytes, d.availBytes)}
                detail={`${formatBytes(d.availBytes)} free of ${formatBytes(d.totalBytes)}`}
              />
            ))}
          </div>
        )}
      </Section>
      {s.warnings.length > 0 && (
        <Section title="Not visible on this server">
          <ul className="space-y-1 text-sm text-fg-muted">
            {s.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
};
