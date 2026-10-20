import { ArrowUpCircle, CheckCircle2, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { useAppUpdate } from '@/features/settings/api/useAppUpdate';

export const AppUpdateCard = () => {
  const { data: update, isFetching, refetch } = useAppUpdate(false);

  const handleCheck = () => {
    void refetch();
  };

  return (
    <div className="rounded-xl border border-border bg-paper p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-accent-soft flex h-10 w-10 items-center justify-center rounded-lg text-accent">
            <ArrowUpCircle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-fg">Software Updates</h3>
            <p className="text-xs text-fg-muted">
              Stackroost Console releases via GitHub Releases (never updates without your explicit
              click)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCheck}
            disabled={isFetching}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            {isFetching ? 'Checking…' : 'Check for Updates'}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="text-fg-muted">Installed Version:</span>
          <Badge variant="neutral" className="font-mono text-xs">
            v0.1.0
          </Badge>
        </div>

        {update && (
          <div>
            {update.hasUpdate ? (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-amber-500">
                  New version available: v{update.latestVersion}
                </span>
                <a
                  href={update.releaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent/90"
                >
                  View Release <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-emerald-500">
                <CheckCircle2 className="h-4 w-4" />
                <span>You are running the latest release</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
