import { ArrowUpCircle, CheckCircle2, Download, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { formatTime } from '@/shared/lib/format';
import { useAppUpdate } from '@/features/settings/api/useAppUpdate';
import { useAbout, useInstallUpdate } from '@/features/settings/api/useDiagnostics';

/** About + updates (PLAN G.2/G.3): real version and build, check on click,
 * install only after a native confirm; the download is signature-checked. */
export const AppUpdateCard = () => {
  const about = useAbout();
  const { data: update, isFetching, refetch } = useAppUpdate(false);
  const install = useInstallUpdate();
  const a = about.data;

  return (
    <div className="rounded-xl border border-border bg-paper p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ember-soft text-ember-text">
            <ArrowUpCircle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-fg">About &amp; updates</h3>
            <p className="text-xs text-fg-muted">
              Checks GitHub Releases only when you click. Updates are signed and installed only
              after you confirm.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? 'Checking…' : 'Check for updates'}
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <dt className="text-fg-muted">Version</dt>
        <dd>
          <Badge variant="neutral" className="font-mono text-xs">
            v{a?.version ?? '—'}
          </Badge>
        </dd>
        <dt className="text-fg-muted">Build</dt>
        <dd className="font-mono text-fg">
          {a ? `${a.gitSha} · ${a.buildEpoch ? formatTime(a.buildEpoch * 1000) : '—'}` : '—'}
        </dd>
        <dt className="text-fg-muted">System</dt>
        <dd className="text-fg">{a ? `macOS ${a.macos} · ${a.arch}` : '—'}</dd>
      </dl>

      {update && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3 text-xs">
          {update.hasUpdate ? (
            <>
              <span className="font-semibold text-warning">
                Version {update.latestVersion} is available
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={update.releaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-ember-text hover:underline"
                >
                  Release notes <ExternalLink className="h-3 w-3" />
                </a>
                <Button
                  size="sm"
                  variant="ember"
                  disabled={install.isPending}
                  onClick={() => install.mutate()}
                >
                  <Download className="h-3.5 w-3.5" />
                  {install.isPending ? 'Installing…' : 'Install & relaunch'}
                </Button>
              </div>
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-success">
              <CheckCircle2 className="h-4 w-4" />
              You&rsquo;re on the latest release
            </span>
          )}
        </div>
      )}
    </div>
  );
};
