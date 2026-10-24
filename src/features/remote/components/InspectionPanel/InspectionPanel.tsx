import { ArrowRight, Lock, LockOpen } from 'lucide-react';
import { Badge } from '@/shared/ui/Badge';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import type { CronJob, RemoteHost } from '@/features/remote/api/remote.schema';
import { useServerInspection } from '@/features/remote/api/useServerInspection';
import { DetailSection } from '@/features/remote/components/DetailSection';
import {
  DOMAIN_ENV_LABEL,
  describeCron,
  domainsOf,
  type Domain,
  type DomainEnv,
  type DomainRoute,
} from '@/features/remote/utils/nginx';

interface Props {
  host: RemoteHost;
  connected: boolean;
}

const ENV_ORDER: DomainEnv[] = ['prod', 'staging', 'dev', 'other'];

const Skeleton = () => (
  <div aria-hidden className="space-y-3 px-6 py-5">
    {Array.from({ length: 6 }, (_, i) => (
      <div key={i} className="h-5 animate-pulse rounded bg-muted" />
    ))}
  </div>
);

/** `http://127.0.0.1:4101/` → `127.0.0.1:4101`; upstreams show their members. */
const RouteTarget = ({ r }: { r: DomainRoute }) => {
  const plain = r.target.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return (
    <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs">
      <span className="truncate text-fg" title={r.target}>
        {r.upstream ? plain : plain || '—'}
      </span>
      {r.upstream && (
        <span className="truncate text-muted-foreground" title={r.upstream.join(', ')}>
          ({r.upstream.join(', ')})
        </span>
      )}
    </span>
  );
};

const DomainRow = ({ d }: { d: Domain }) => (
  <li className="px-3 py-3">
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-mono text-sm font-medium text-fg">
        {d.name || 'Default server (any other hostname)'}
      </span>
      {d.https ? (
        <Badge tone="success" size="sm">
          <Lock className="size-3" aria-hidden />
          HTTPS
        </Badge>
      ) : (
        d.name && (
          <Badge tone="warning" size="sm">
            <LockOpen className="size-3" aria-hidden />
            HTTP only
          </Badge>
        )
      )}
      {d.httpRedirects && (
        <span className="text-xs text-muted-foreground">http redirects to https</span>
      )}
      {d.aliases.length > 0 && (
        <span className="text-xs text-muted-foreground">also {d.aliases.join(', ')}</span>
      )}
    </div>
    {d.routes.length > 0 && (
      <ul className="mt-2 space-y-1">
        {d.routes.map((r) => (
          <li
            key={r.path}
            className="grid grid-cols-[minmax(4rem,9rem)_auto_minmax(0,1fr)] items-center gap-2 text-xs"
          >
            <span className="truncate font-mono text-muted-foreground" title={r.path}>
              {r.path}
            </span>
            <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
            <span className="flex min-w-0 items-center gap-2">
              <RouteTarget r={r} />
              {r.note && (
                <span className="truncate text-muted-foreground" title={r.note}>
                  · {r.note}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    )}
  </li>
);

const CronRow = ({ job }: { job: CronJob }) => {
  const words = describeCron(job.schedule);
  return (
    <tr className="align-top">
      <td className="px-3 py-2 whitespace-nowrap">
        <p className="text-fg">{words ?? job.schedule}</p>
        {words && <p className="font-mono text-xs text-muted-foreground">{job.schedule}</p>}
      </td>
      <td className="max-w-0 px-3 py-2">
        <p className="truncate font-mono text-xs text-fg" title={job.command}>
          {job.command}
        </p>
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{job.user ?? 'you'}</td>
      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
        {job.source === 'crontab' ? 'your crontab' : job.source.replace('/etc/cron.d/', 'cron.d/')}
      </td>
    </tr>
  );
};

export const InspectionPanel = ({ host, connected }: Props) => {
  const { data, isLoading, error, refetch } = useServerInspection(host.id, connected);

  if (isLoading) return <Skeleton />;
  if (error) {
    return (
      <div className="px-6 py-5">
        <ErrorPanel
          error={error}
          fallback="Couldn't read nginx and cron on this server"
          onRetry={() => void refetch()}
        />
      </div>
    );
  }
  if (!data) return null;

  const domains = domainsOf(data.nginxSites, data.upstreams);
  const groups = ENV_ORDER.map((env) => ({
    env,
    items: domains.filter((d) => d.env === env),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <DetailSection
        title="Web server"
        description={
          !data.nginxInstalled
            ? 'nginx isn’t installed on this server.'
            : data.nginxActive
              ? `nginx is serving ${domains.filter((d) => d.name).length} domain${domains.filter((d) => d.name).length === 1 ? '' : 's'}. After editing its config, test and reload it from a terminal.`
              : 'nginx is installed but not running.'
        }
        aside={
          <Badge
            tone={data.nginxActive ? 'success' : data.nginxInstalled ? 'warning' : 'neutral'}
            size="sm"
            dot
          >
            {data.nginxActive ? 'Running' : data.nginxInstalled ? 'Stopped' : 'Not installed'}
          </Badge>
        }
      >
        {data.nginxInstalled && (
          <code className="block w-fit rounded-md border border-hairline bg-muted px-2.5 py-1.5 font-mono text-xs text-muted-foreground select-all">
            {data.reloadGuidance}
          </code>
        )}
      </DetailSection>

      {groups.map((g) => (
        <DetailSection
          key={g.env}
          title={DOMAIN_ENV_LABEL[g.env]}
          description={
            g.env === 'other'
              ? 'Domains whose name doesn’t say which environment they are.'
              : 'Guessed from the domain name. Each path shows the app port nginx forwards it to.'
          }
          aside={
            <span className="text-xs text-muted-foreground tabular-nums">
              {g.items.length} domain{g.items.length === 1 ? '' : 's'}
            </span>
          }
        >
          <ul className="divide-y divide-hairline rounded-lg border border-hairline">
            {g.items.map((d) => (
              <DomainRow key={d.name || '(default)'} d={d} />
            ))}
          </ul>
        </DetailSection>
      ))}

      <DetailSection
        title="Scheduled jobs"
        description="Your crontab and /etc/cron.d. System crontabs of other users need root to read."
        aside={
          <span className="text-xs text-muted-foreground tabular-nums">{data.cronJobs.length}</span>
        }
      >
        {data.cronJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scheduled jobs found.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-hairline">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-48" />
                <col />
                <col className="w-20" />
                <col className="w-36" />
              </colgroup>
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Command</th>
                  <th className="px-3 py-2 font-medium">Runs as</th>
                  <th className="px-3 py-2 font-medium">From</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {data.cronJobs.map((job, i) => (
                  <CronRow key={`${job.source}:${i}`} job={job} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DetailSection>
    </div>
  );
};
