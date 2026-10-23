import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatBytes, formatDuration } from '@/shared/lib/format';
import { Sparkline } from '@/shared/ui/Sparkline';
import type { HostSnapshot } from '@/features/remote/api/remote.schema';
import { usedPct } from '@/features/remote/utils/health';
import type { Sample } from '@/features/remote/utils/history';
import {
  describeLoad,
  fullestDisk,
  level,
  splitDisks,
  type Level,
} from '@/features/remote/utils/overview';
import { DetailSection } from '@/features/remote/components/DetailSection';
import { Meter } from '@/features/remote/components/Meter';

export type OverviewTarget = 'containers' | 'services' | 'ports' | 'issues' | 'disk';

const LEVEL_TEXT: Record<Level, string> = {
  ok: 'text-success',
  warn: 'text-warning',
  crit: 'text-destructive',
  none: 'text-muted-foreground',
};

const SPARK_TONE = { ok: 'ember', warn: 'warning', crit: 'danger', none: 'ember' } as const;

interface TileProps {
  label: string;
  value: string;
  status: string;
  level: Level;
  detail: string;
  trend?: (number | null)[];
}

/** One answer to "is this OK?": the number, a word for it, and the context. */
const Tile = ({ label, value, status, level: lv, detail, trend }: TileProps) => (
  <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-hairline px-4 py-3">
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-medium', LEVEL_TEXT[lv])}>{status}</span>
    </div>
    <div className="flex items-end justify-between gap-3">
      <span className="text-xl font-semibold text-foreground tabular-nums">{value}</span>
      {trend && trend.filter((v) => v != null).length > 1 && (
        <Sparkline
          values={trend}
          width={72}
          height={22}
          tone={SPARK_TONE[lv]}
          label={`${label} trend`}
        />
      )}
    </div>
    <span className="truncate text-xs text-muted-foreground tabular-nums" title={detail}>
      {detail}
    </span>
  </div>
);

interface RowProps {
  label: string;
  value: ReactNode;
  tone?: Level;
  onOpen?: () => void;
}

/** A "what's running" line; clickable when another tab has the details. */
const Row = ({ label, value, tone = 'none', onOpen }: RowProps) => {
  const body = (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-1">
        <span
          className={cn(
            'truncate text-right',
            tone === 'none' ? 'text-foreground' : LEVEL_TEXT[tone],
          )}
        >
          {value}
        </span>
        {onOpen && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
      </span>
    </>
  );
  const cls = 'flex w-full items-center justify-between gap-4 px-3 py-2.5 text-sm';
  return (
    <li>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            cls,
            'cursor-pointer text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          )}
        >
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
};

const Fact = ({ k, v }: { k: string; v: string }) => (
  <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
    <dt className="shrink-0 text-muted-foreground">{k}</dt>
    <dd className="min-w-0 truncate text-right text-foreground" title={v}>
      {v}
    </dd>
  </div>
);

export const OverviewPanel = ({
  snapshot: s,
  history,
  onOpen,
}: {
  snapshot: HostSnapshot;
  history: Sample[];
  onOpen: (target: OverviewTarget) => void;
}) => {
  const m = s.memory;
  const memUsed = m.totalBytes - m.availableBytes;
  const memPct = m.totalBytes > 0 ? (memUsed * 100) / m.totalBytes : null;
  const swapUsed = m.swapTotalBytes - m.swapFreeBytes;
  const cpuLevel = level(s.cpu.usagePct, 70, 90);
  const memLevel = level(memPct, 85, 95);
  const load = describeLoad(s.cpu.load5, s.cpu.cores);
  const disk = fullestDisk(s.disks);
  const diskLevel = level(disk?.pct ?? null, 80, 90);
  const { main, system } = splitDisks(s.disks);

  const running = s.containers.filter((c) => c.state === 'running').length;
  const unhealthy = s.containers.filter(
    (c) => c.health === 'unhealthy' || c.state === 'restarting',
  ).length;
  const pm2Online = s.pm2?.filter((p) => p.status === 'online').length ?? 0;
  const issues = s.findings.filter((f) => f.severity !== 'green').length;

  const docker: { value: string; tone: Level } =
    s.docker.state === 'ok'
      ? {
          value:
            s.containers.length === 0
              ? 'No containers'
              : `${running} of ${s.containers.length} running${unhealthy ? ` · ${unhealthy} unhealthy` : ''}`,
          tone: unhealthy ? 'warn' : 'none',
        }
      : s.docker.state === 'noPermission'
        ? { value: 'Installed, but your user can’t read it', tone: 'warn' }
        : s.docker.state === 'daemonDown'
          ? { value: 'Installed, not running', tone: 'warn' }
          : { value: 'Not installed', tone: 'none' };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <DetailSection
        title="Health"
        description="Live numbers from the last check, with the trend since you opened this server."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile
            label="CPU"
            value={s.cpu.usagePct == null ? '—' : `${Math.round(s.cpu.usagePct)}%`}
            status={
              cpuLevel === 'ok'
                ? 'Normal'
                : cpuLevel === 'warn'
                  ? 'High'
                  : cpuLevel === 'crit'
                    ? 'Very high'
                    : 'No data'
            }
            level={cpuLevel}
            detail={`${s.cpu.cores} core${s.cpu.cores === 1 ? '' : 's'}`}
            trend={history.map((h) => h.cpuPct)}
          />
          <Tile
            label="Memory"
            value={memPct == null ? '—' : `${Math.round(memPct)}%`}
            status={
              memLevel === 'ok'
                ? 'Normal'
                : memLevel === 'warn'
                  ? 'High'
                  : memLevel === 'crit'
                    ? 'Almost full'
                    : 'No data'
            }
            level={memLevel}
            detail={`${formatBytes(memUsed)} of ${formatBytes(m.totalBytes)}${
              m.swapTotalBytes > 0 && swapUsed > 0 ? ` · swap ${formatBytes(swapUsed)}` : ''
            }`}
            trend={history.map((h) => h.memPct)}
          />
          <Tile
            label="Disk"
            value={disk ? `${Math.round(disk.pct)}%` : '—'}
            status={
              diskLevel === 'ok'
                ? 'Plenty free'
                : diskLevel === 'warn'
                  ? 'Filling up'
                  : diskLevel === 'crit'
                    ? 'Almost full'
                    : 'No data'
            }
            level={diskLevel}
            detail={
              disk
                ? `${formatBytes(disk.disk.availBytes)} free on ${disk.disk.mount}`
                : 'No disks reported'
            }
          />
          <Tile
            label="Load"
            value={s.cpu.load5.toFixed(2)}
            status={load.text}
            level={load.level}
            detail={`5-min average on ${s.cpu.cores} core${s.cpu.cores === 1 ? '' : 's'}`}
          />
        </div>
      </DetailSection>

      <DetailSection title="What’s running" description="Open a line for the full list.">
        <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline">
          <Row
            label="Issues"
            value={issues === 0 ? 'None' : `${issues} need attention`}
            tone={issues ? 'warn' : 'ok'}
            onOpen={() => onOpen('issues')}
          />
          <Row
            label="Docker"
            value={docker.value}
            tone={docker.tone}
            onOpen={
              s.docker.state === 'noPermission'
                ? () => onOpen('issues')
                : s.docker.state === 'ok'
                  ? () => onOpen('containers')
                  : undefined
            }
          />
          {s.pm2 && (
            <Row
              label="PM2 apps"
              value={`${pm2Online} of ${s.pm2.length} online`}
              tone={pm2Online < s.pm2.length ? 'warn' : 'none'}
              onOpen={() => onOpen('services')}
            />
          )}
          <Row
            label="System services"
            value={`${s.services.length} running${s.failedUnits.length ? ` · ${s.failedUnits.length} failed` : ''}`}
            tone={s.failedUnits.length ? 'crit' : 'none'}
            onOpen={() => onOpen('services')}
          />
          <Row label="Listening ports" value={`${s.ports.length}`} onOpen={() => onOpen('ports')} />
        </ul>
      </DetailSection>

      <DetailSection
        title="Disks"
        aside={
          <button
            type="button"
            onClick={() => onOpen('disk')}
            className="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Disk & cleanup
          </button>
        }
      >
        {main.length === 0 ? (
          <p className="text-sm text-muted-foreground">No disks reported.</p>
        ) : (
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2">
            {main.map((d) => (
              <Meter
                key={`${d.fs}${d.mount}`}
                label={d.mount}
                pct={usedPct(d.usedBytes, d.availBytes)}
                warnAt={80}
                critAt={90}
                detail={`${formatBytes(d.availBytes)} free of ${formatBytes(d.totalBytes)}`}
              />
            ))}
          </div>
        )}
        {system.length > 0 && (
          <p className="mt-4 text-xs text-muted-foreground">
            Also {system.length} small system partition{system.length === 1 ? '' : 's'} (
            {system.map((d) => d.mount).join(', ')}) — managed by the OS.
          </p>
        )}
      </DetailSection>

      <DetailSection title="System">
        <dl className="grid grid-cols-1 gap-x-8 divide-y divide-hairline lg:grid-cols-2 lg:divide-y-0">
          <div className="divide-y divide-hairline">
            <Fact k="Hostname" v={s.system.hostname || '—'} />
            <Fact k="OS" v={s.system.os || '—'} />
            <Fact
              k="Kernel"
              v={[s.system.kernel, s.system.arch].filter(Boolean).join(' · ') || '—'}
            />
          </div>
          <div className="divide-y divide-hairline">
            <Fact k="Up for" v={formatDuration(s.system.uptimeSecs)} />
            <Fact
              k="Docker"
              v={s.docker.version ?? (s.docker.state === 'absent' ? 'Not installed' : 'Unknown')}
            />
            <Fact
              k="Restart needed"
              v={s.system.rebootRequired ? 'Yes — updates are waiting for a reboot' : 'No'}
            />
          </div>
        </dl>
      </DetailSection>

      {s.warnings.length > 0 && (
        <DetailSection
          title="Not visible on this server"
          description="Parts of the check that couldn’t run, so their numbers are missing above."
        >
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {s.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </DetailSection>
      )}
    </div>
  );
};
