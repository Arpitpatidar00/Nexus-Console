import { Globe, Lock, Terminal, Clock } from 'lucide-react';
import { Badge } from '@/shared/ui/Badge';
import { Spinner } from '@/shared/ui/Spinner';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import type { RemoteHost } from '@/features/remote/api/remote.schema';
import { useServerInspection } from '@/features/remote/api/useServerInspection';

interface Props {
  host: RemoteHost;
  connected: boolean;
}

export const InspectionPanel = ({ host, connected }: Props) => {
  const { data: inspection, isLoading, error, refetch } = useServerInspection(host.id, connected);

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-12">
        <Spinner className="size-6 text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorPanel
          error={error}
          fallback="Failed to inspect server services"
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  if (!inspection) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
      {/* Nginx Status Banner */}
      <div className="rounded-2xl border border-hairline bg-card/50 p-5 shadow-sm backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe className="size-6 text-success" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-fg">Nginx Web Server</h3>
                <Badge
                  variant={
                    inspection.nginxRunning
                      ? 'success'
                      : inspection.nginxInstalled
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {inspection.nginxRunning
                    ? 'Active & Running'
                    : inspection.nginxInstalled
                      ? 'Stopped'
                      : 'Not Installed'}
                </Badge>
              </div>
              <p className="text-xs text-fg-subtle">
                {inspection.nginxInstalled
                  ? `${inspection.nginxSites.length} virtual host site configs discovered`
                  : 'Nginx binary was not detected on this host'}
              </p>
            </div>
          </div>
          {inspection.nginxRunning && (
            <div className="flex items-center gap-1.5 rounded-lg border border-hairline bg-muted/40 px-3 py-1.5 font-mono text-xs text-fg-muted">
              <Terminal className="size-3.5" />
              <span>nginx -t && systemctl reload nginx</span>
            </div>
          )}
        </div>

        {/* Nginx Sites */}
        {inspection.nginxSites.length > 0 && (
          <div className="mt-4 divide-y divide-hairline rounded-xl border border-hairline bg-canvas/60">
            {inspection.nginxSites.map((site) => (
              <div key={site.path} className="flex flex-col gap-2 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-fg">{site.name}</span>
                    <Badge variant={site.enabled ? 'success' : 'neutral'}>
                      {site.enabled ? 'Enabled' : 'Available'}
                    </Badge>
                    {site.ssl && (
                      <span className="flex items-center gap-1 rounded bg-success-soft px-1.5 py-0.5 text-xs font-medium text-success">
                        <Lock className="size-3" />
                        SSL
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-xs text-fg-muted">
                    <span>Ports:</span>
                    {site.listenPorts.map((p) => (
                      <span key={p} className="rounded bg-muted px-1.5 py-0.5 text-fg">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>

                {site.serverNames.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    <span className="text-fg-subtle">Domains:</span>
                    {site.serverNames.map((d) => (
                      <span key={d} className="font-mono text-fg-muted">
                        {d}
                      </span>
                    ))}
                  </div>
                )}

                {site.proxyPasses.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    <span className="text-fg-subtle">Proxy Pass:</span>
                    {site.proxyPasses.map((target) => (
                      <span key={target} className="font-mono text-primary">
                        {target}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cron Jobs */}
      <div className="rounded-2xl border border-hairline bg-card/50 p-5 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Clock className="size-6 text-primary" />
          <div>
            <h3 className="font-semibold text-fg">Scheduled Cron Jobs</h3>
            <p className="text-xs text-fg-subtle">
              {inspection.cronJobs.length} active cron entries discovered in user crontabs and
              /etc/cron.*
            </p>
          </div>
        </div>

        {inspection.cronJobs.length === 0 ? (
          <div className="py-8 text-center text-xs text-fg-subtle">
            No scheduled cron jobs configured on this host.
          </div>
        ) : (
          <div className="mt-4 divide-y divide-hairline rounded-xl border border-hairline bg-canvas/60">
            {inspection.cronJobs.map((job, idx) => (
              <div key={idx} className="flex items-center justify-between gap-4 p-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                      {job.schedule}
                    </span>
                    <span className="truncate font-mono text-xs text-fg">{job.command}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-fg-subtle">
                  <span>
                    user: <strong className="font-normal text-fg-muted">{job.user}</strong>
                  </span>
                  <span>•</span>
                  <span>{job.source}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
