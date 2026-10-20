import type { ReactNode } from 'react';
import { formatBytes, formatPercent } from '@/shared/lib/format';
import { chipStyles, dotStyles } from '@/shared/ui/StatusChip/StatusChip.styles';
import type { HostSnapshot } from '@/features/remote/api/remote.schema';

const Heading = ({ children }: { children: ReactNode }) => (
  <h3 className="sticky top-0 z-[1] border-b border-border bg-paper px-5 pt-3 pb-1.5 text-xs font-medium text-fg-subtle">
    {children}
  </h3>
);

const PM2_TONE: Record<string, 'running' | 'stopped' | 'error'> = {
  online: 'running',
  errored: 'error',
  stopped: 'error',
};

export const ServicesPanel = ({ snapshot: s }: { snapshot: HostSnapshot }) => {
  const noSystemd = s.services.length === 0 && s.failedUnits.length === 0;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {s.failedUnits.length > 0 && (
        <section>
          <Heading>Failed ({s.failedUnits.length})</Heading>
          <ul className="divide-y divide-border">
            {s.failedUnits.map((u) => (
              <li key={u.unit} className="flex items-center gap-3 px-5 py-2">
                <span className={chipStyles({ status: 'error' })}>
                  <span className={dotStyles({ status: 'error' })} />
                  Failed
                </span>
                <span className="font-mono text-sm text-fg">{u.unit}</span>
                <span className="min-w-0 truncate text-sm text-fg-muted">{u.description}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {s.pm2 && (
        <section>
          <Heading>PM2 ({s.pm2.length})</Heading>
          {s.pm2.length === 0 ? (
            <p className="px-5 py-3 text-sm text-fg-muted">PM2 is installed but runs no apps.</p>
          ) : (
            <ul className="divide-y divide-border">
              {s.pm2.map((a) => {
                const tone = PM2_TONE[a.status] ?? 'stopped';
                return (
                  <li key={a.name} className="flex items-center gap-3 px-5 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                      {a.name}
                    </span>
                    <span className={chipStyles({ status: tone })}>
                      <span className={dotStyles({ status: tone })} />
                      {a.status}
                    </span>
                    <span className="w-24 text-right text-xs text-fg-muted tabular-nums">
                      {a.restarts} restart{a.restarts === 1 ? '' : 's'}
                    </span>
                    <span className="w-14 text-right text-xs text-fg-muted tabular-nums">
                      {formatPercent(a.cpu)}
                    </span>
                    <span className="w-16 text-right text-xs text-fg-muted tabular-nums">
                      {formatBytes(a.memBytes)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section>
        <Heading>Running services ({s.services.length})</Heading>
        {noSystemd ? (
          <p className="px-5 py-3 text-sm text-fg-muted">
            No systemd services were listed on this server.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {s.services.map((u) => (
              <li key={u.unit} className="flex items-baseline gap-3 px-5 py-2">
                <span className="w-64 shrink-0 truncate font-mono text-sm text-fg" title={u.unit}>
                  {u.unit.replace(/\.service$/, '')}
                </span>
                <span className="min-w-0 truncate text-sm text-fg-muted">{u.description}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
