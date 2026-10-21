import { ClipboardCopy, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Panel } from '@/shared/ui/Panel';
import { formatTime } from '@/shared/lib/format';
import {
  useClearErrorLog,
  useCopyDiagnostics,
  useErrorLog,
} from '@/features/settings/api/useDiagnostics';

/** Local-only error log + "Copy diagnostics" for bug reports (PLAN G.4). */
export const DiagnosticsCard = () => {
  const log = useErrorLog();
  const clear = useClearErrorLog();
  const copy = useCopyDiagnostics();
  const entries = log.data ?? [];

  return (
    <Panel
      title="Diagnostics"
      subtitle="Errors Stackroost hit, kept only on this Mac (last 200). Nothing is sent anywhere — copy a redacted report into a bug report yourself."
      className="xl:col-span-2"
      action={
        <div className="flex items-center gap-2">
          <Button variant="glass" size="sm" disabled={copy.isPending} onClick={() => copy.mutate()}>
            <ClipboardCopy className="h-3.5 w-3.5" />
            {copy.isSuccess ? 'Copied' : 'Copy diagnostics'}
          </Button>
          <Button
            variant="dangerGhost"
            size="sm"
            disabled={entries.length === 0 || clear.isPending}
            onClick={() => clear.mutate()}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      }
    >
      {entries.length === 0 ? (
        <p className="py-3 text-sm text-fg-muted">No errors recorded.</p>
      ) : (
        <ul className="max-h-72 divide-y divide-hairline overflow-y-auto">
          {entries.slice(0, 50).map((e, i) => (
            <li key={`${e.epochMs}-${i}`} className="py-2.5">
              <p className="flex items-center gap-2 text-xs text-fg-muted">
                <span>{formatTime(e.epochMs)}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                  {e.source}/{e.kind}
                </span>
                {e.command && <span className="font-mono">{e.command}</span>}
              </p>
              <p className="mt-0.5 text-sm break-words text-fg">{e.message}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
};
