import { KeyRound } from 'lucide-react';
import { formatBytes } from '@/shared/lib/format';
import { IpcError } from '@/shared/tauri';
import { Button } from '@/shared/ui/Button';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Spinner } from '@/shared/ui/Spinner';
import { useDeepScan } from '@/features/maclean/api/macleanMutations';
import { Card } from '@/features/maclean/components/Card';
import { CausesList } from '@/features/maclean/components/CausesList';
import { DeepScanEntryRow } from './DeepScanEntryRow';
import type { DeepScanCardProps } from './DeepScanCard.types';

/** The script's `--deep`. Explains "Other users & system data". */
export const DeepScanCard = ({ unexplainedBytes, dataUsedBytes }: DeepScanCardProps) => {
  const deep = useDeepScan();
  const cancelled = deep.error instanceof IpcError && deep.error.kind === 'cancelled';

  return (
    <>
      <Card
        title="Inside the Data volume"
        aside={
          <Button
            size="sm"
            variant="secondary"
            disabled={deep.isPending}
            onClick={() => deep.mutate()}
          >
            {deep.isPending ? (
              <Spinner className="text-current" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            {deep.data ? 'Run again' : 'Deep scan…'}
          </Button>
        }
      >
        {deep.data ? (
          <ul className="divide-y divide-border">
            {deep.data.entries.map((entry) => (
              <DeepScanEntryRow key={entry.label} entry={entry} dataUsedBytes={dataUsedBytes} />
            ))}
          </ul>
        ) : (
          <div className="space-y-2 px-5 py-4 text-sm text-fg-muted">
            {deep.isPending ? (
              <p>Measuring system folders as administrator. This takes a couple of minutes…</p>
            ) : (
              <>
                <p>
                  {formatBytes(unexplainedBytes)} isn’t broken down yet: other accounts, app
                  containers, system data and snapshots.
                </p>
                <p className="text-xs text-fg-subtle">
                  macOS asks for your password once. The deep scan only measures sizes; it never
                  changes or deletes anything.
                </p>
                {cancelled && <p className="text-xs">Cancelled. Nothing was measured.</p>}
              </>
            )}
          </div>
        )}
        {deep.isError && !cancelled && (
          <div className="px-5 pb-4">
            <ErrorPanel error={deep.error} fallback="The deep scan failed" />
          </div>
        )}
      </Card>
      {deep.data && deep.data.causes.length > 0 && <CausesList causes={deep.data.causes} />}
    </>
  );
};
