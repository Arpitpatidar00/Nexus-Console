import { useState } from 'react';
import { ShieldCheck, ShieldAlert, Check, X, RotateCw, GitCompare, KeyRound } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { Spinner } from '@/shared/ui/Spinner';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import type { RemoteHost } from '@/features/remote/api/remote.schema';
import { useParityAudit } from '@/features/remote/api/useParityAudit';

interface Props {
  host: RemoteHost;
  connected: boolean;
}

export const ParityAuditorView = ({ host, connected }: Props) => {
  const [appPath, setAppPath] = useState('/var/www/app');
  const [localPath, setLocalPath] = useState('');

  const {
    data: report,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useParityAudit(
    {
      localProjectPath: localPath.trim() || undefined,
      hostIds: [host.id],
      remoteAppPaths: { [host.id]: appPath.trim() },
    },
    connected,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
      {/* Header and Path Configuration */}
      <div className="flex shrink-0 items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <GitCompare className="size-5 text-primary" />
          <div>
            <h3 className="font-semibold text-fg">Environment Parity Auditor</h3>
            <p className="text-xs text-fg-subtle">
              Audit runtime toolchain versions, .env key parity, and cross-environment secret leaks
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={isLoading || isFetching}
          onClick={() => void refetch()}
        >
          <RotateCw className={`mr-1.5 size-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Run Parity Audit
        </Button>
      </div>

      {/* Path Configuration Bar */}
      <div className="bg-surface/50 flex flex-wrap items-center gap-4 rounded-2xl border border-hairline p-4 shadow-sm backdrop-blur-sm">
        <div className="flex min-w-[240px] flex-1 items-center gap-2">
          <label
            htmlFor="parity-remote-app-dir"
            className="text-xs font-medium whitespace-nowrap text-fg-muted"
          >
            Remote App Dir:
          </label>
          <input
            id="parity-remote-app-dir"
            type="text"
            value={appPath}
            onChange={(e) => setAppPath(e.target.value)}
            placeholder="e.g. /var/www/app or /srv/project"
            className="w-full rounded-lg border border-hairline bg-canvas px-2.5 py-1.5 font-mono text-xs text-fg focus:ring-1 focus:ring-primary focus:outline-none"
          />
        </div>

        <div className="flex min-w-[240px] flex-1 items-center gap-2">
          <label
            htmlFor="parity-local-repo-dir"
            className="text-xs font-medium whitespace-nowrap text-fg-muted"
          >
            Local Repo Dir (Optional):
          </label>
          <input
            id="parity-local-repo-dir"
            type="text"
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            placeholder="e.g. /Users/you/Projects/app"
            className="w-full rounded-lg border border-hairline bg-canvas px-2.5 py-1.5 font-mono text-xs text-fg focus:ring-1 focus:ring-primary focus:outline-none"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-12">
          <Spinner className="size-6 text-primary" />
        </div>
      ) : error ? (
        <ErrorPanel
          error={error}
          fallback="Failed to complete environment parity audit"
          onRetry={() => void refetch()}
        />
      ) : !report ? null : (
        <>
          {/* Runtime Versions Matrix */}
          <div className="bg-surface/50 rounded-2xl border border-hairline p-5 shadow-sm backdrop-blur-sm">
            <h4 className="mb-3 text-sm font-semibold text-fg">Runtime & Server Version Parity</h4>
            <div className="divide-y divide-hairline rounded-xl border border-hairline bg-canvas/60">
              <div className="grid grid-cols-4 px-4 py-2.5 text-xs font-semibold text-fg-subtle">
                <span>RUNTIME</span>
                <span>THIS MAC (LOCAL)</span>
                <span>{host.label}</span>
                <span className="text-right">PARITY STATUS</span>
              </div>
              {report.versions.map((v) => {
                const remoteVer: string | null = v.remoteVersions[host.id] ?? null;
                const matches =
                  v.localVersion && remoteVer
                    ? v.localVersion.split('.')[0] === remoteVer.split('.')[0]
                    : false;

                return (
                  <div
                    key={v.name}
                    className="grid grid-cols-4 items-center px-4 py-3 font-mono text-xs"
                  >
                    <span className="font-semibold text-fg">{v.name}</span>
                    <span className="text-fg-muted">{v.localVersion ?? '—'}</span>
                    <span className="text-fg-muted">{remoteVer ?? 'Not installed'}</span>
                    <div className="flex justify-end">
                      {matches ? (
                        <Badge variant="success" className="gap-1">
                          <Check className="size-3" /> Parity
                        </Badge>
                      ) : !remoteVer ? (
                        <Badge variant="neutral">Absent</Badge>
                      ) : (
                        <Badge variant="warning" className="gap-1">
                          <X className="size-3" /> Mismatch
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* .env Keys Matrix */}
          <div className="bg-surface/50 rounded-2xl border border-hairline p-5 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-primary" />
                <h4 className="text-sm font-semibold text-fg">
                  Environment Secret & Config Keys (.env)
                </h4>
              </div>
              <span className="text-xs text-fg-subtle">
                Values are never transferred. Only salted HMAC signatures are compared.
              </span>
            </div>

            {/* Same Value Warning Banner */}
            {report.envKeys.some((k) => k.sameValueWarning) && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-500">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                <div>
                  <strong className="font-semibold">Secret Cross-Contamination Warning:</strong> One
                  or more production secrets match identical values found on non-production
                  environments! Verify that staging or local setups are not pointing to live
                  production credentials.
                </div>
              </div>
            )}

            {report.envKeys.length === 0 ? (
              <div className="py-8 text-center text-xs text-fg-subtle">
                No .env configuration keys detected in the specified directories.
              </div>
            ) : (
              <div className="divide-y divide-hairline rounded-xl border border-hairline bg-canvas/60">
                <div className="grid grid-cols-4 px-4 py-2.5 text-xs font-semibold text-fg-subtle">
                  <span className="col-span-2">VARIABLE KEY</span>
                  <span>PRESENCE</span>
                  <span className="text-right">SECURITY STATUS</span>
                </div>
                {report.envKeys.map((k) => (
                  <div
                    key={k.key}
                    className="grid grid-cols-4 items-center px-4 py-2.5 font-mono text-xs"
                  >
                    <span className="col-span-2 truncate font-medium text-fg">{k.key}</span>
                    <div className="flex items-center gap-2 text-fg-muted">
                      {k.inLocal && <Badge variant="neutral">Local</Badge>}
                      {Boolean(k.inRemote[host.id]) && <Badge variant="neutral">Remote</Badge>}
                    </div>
                    <div className="flex justify-end">
                      {k.sameValueWarning ? (
                        <Badge variant="danger" className="gap-1">
                          <ShieldAlert className="size-3" /> Same Value As Prod
                        </Badge>
                      ) : (
                        <Badge variant="neutral" className="gap-1">
                          <ShieldCheck className="size-3 text-emerald-500" /> Isolated
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
