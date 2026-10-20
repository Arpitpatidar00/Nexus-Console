import { CircleCheck, RefreshCw, TriangleAlert } from 'lucide-react';
import { useAppContext } from '@/shared/tauri';
import { Spinner } from '@/shared/ui/Spinner';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/lib/cn';
import { useUpdateHomebrew } from '@/features/settings/api/useUpdateHomebrew';

export const HomebrewStatusCard = () => {
  const { data, isPending } = useAppContext();
  const update = useUpdateHomebrew();

  const detected = Boolean(data?.brewPrefix);

  return (
    <section className="rounded-xl p-6 text-card-foreground shadow-edge glass">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-semibold text-foreground">Homebrew</h2>
        {detected && (
          <Button
            variant="glass"
            size="sm"
            disabled={update.isPending}
            onClick={() => update.mutate()}
          >
            <RefreshCw className={cn('size-3.5', update.isPending && 'animate-spin')} />
            Update Homebrew
          </Button>
        )}
      </div>

      {isPending ? (
        <div className="mt-4">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-2">
            {detected ? (
              <CircleCheck className="size-4 text-success" />
            ) : (
              <TriangleAlert className="size-4 text-warning" />
            )}
            <span className="text-sm text-foreground">
              {detected ? `Installed · v${data?.brewVersion ?? '—'}` : 'Homebrew not detected'}
            </span>
          </div>

          {detected && (
            <dl className="mt-4 grid grid-cols-[5rem_1fr] gap-y-2 text-xs">
              <dt className="text-muted-foreground">Prefix</dt>
              <dd className="font-mono text-foreground">{data?.brewPrefix}</dd>
              <dt className="text-muted-foreground">Platform</dt>
              <dd className="text-foreground">
                {data?.platform} · {data?.arch}
              </dd>
            </dl>
          )}
        </>
      )}
    </section>
  );
};
