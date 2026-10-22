import { AlertTriangle, CheckCircle2, FileCode, Network, RefreshCw, Terminal } from 'lucide-react';
import { Dialog } from '@/shared/ui/Dialog';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import { useAppDispatch } from '@/shared/state/hooks';
import { openTerminal } from '@/shared/state/terminalsSlice';
import { setActiveTab } from '@/shared/state/uiSlice';
import {
  useOpenServiceConfig,
  useServiceDiagnosis,
} from '@/features/services/api/useServiceDiagnosis';
import type { ServiceDiagnosis } from '@/features/services/api/diagnosis.schema';

interface ServiceDiagnosisDialogProps {
  formula: string;
  displayName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ServiceDiagnosisDialog = ({
  formula,
  displayName,
  open,
  onOpenChange,
}: ServiceDiagnosisDialogProps) => {
  const diag = useServiceDiagnosis(formula, open);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Why won't ${displayName} start?`}
      description="Read-only checks: the daemon's own self-test and the end of its log."
      size="lg"
      footer={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void diag.refetch()}
          disabled={diag.isFetching}
        >
          <RefreshCw className={diag.isFetching ? 'animate-spin' : undefined} />
          Check again
        </Button>
      }
    >
      {diag.isPending ? (
        <div className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
          <Spinner /> Running checks…
        </div>
      ) : diag.isError ? (
        <p className="py-6 text-sm text-destructive">{diag.error.message}</p>
      ) : (
        <DiagnosisBody d={diag.data} onDone={() => onOpenChange(false)} />
      )}
    </Dialog>
  );
};

const DiagnosisBody = ({ d, onDone }: { d: ServiceDiagnosis; onDone: () => void }) => {
  const dispatch = useAppDispatch();
  const openConfig = useOpenServiceConfig();
  const fix = d.fix;

  return (
    <div className="flex flex-col gap-5">
      {d.cause ? (
        <div className="flex gap-3 rounded-lg border border-destructive/30 bg-danger-soft p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium break-words text-foreground">{d.cause}</p>
            {fix && <p className="text-[13px] text-muted-foreground">{fix.summary}</p>}
          </div>
        </div>
      ) : (
        <div className="flex gap-3 rounded-lg border border-success/30 bg-success-soft p-4">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          <p className="text-sm text-foreground">
            No known problem found. If it still won't start, the log below shows its last words.
          </p>
        </div>
      )}

      {fix && (
        <div className="flex flex-wrap items-center gap-2">
          {fix.kind === 'runCommand' && fix.command && (
            <>
              <code className="selectable rounded-md bg-muted px-2.5 py-1.5 font-mono text-[13px]">
                {fix.command}
              </code>
              <Button
                variant="ember"
                size="sm"
                onClick={() => {
                  dispatch(
                    openTerminal({
                      target: { type: 'workspace', command: fix.command ?? '', projectPath: '' },
                      title: fix.command ?? 'Fix',
                    }),
                  );
                  onDone();
                }}
              >
                <Terminal /> Run in terminal
              </Button>
            </>
          )}
          {fix.kind === 'editConfig' && fix.path && (
            <>
              <code className="selectable rounded-md bg-muted px-2.5 py-1.5 font-mono text-[13px]">
                {fix.path}
                {fix.line ? `:${fix.line}` : ''}
              </code>
              <Button
                variant="ember"
                size="sm"
                disabled={openConfig.isPending}
                onClick={() => openConfig.mutate(d.name)}
              >
                <FileCode /> Open in editor
              </Button>
            </>
          )}
          {fix.kind === 'freePort' && (
            <Button
              variant="ember"
              size="sm"
              onClick={() => {
                dispatch(setActiveTab('ports'));
                onDone();
              }}
            >
              <Network /> Open Ports
            </Button>
          )}
        </div>
      )}

      {d.checks.map((c) => (
        <section key={c.command} className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {c.label} · {c.ok ? 'passed' : 'failed'}
          </h4>
          <pre className="selectable max-h-40 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap text-foreground">
            $ {c.command}
            {'\n'}
            {c.output || '(no output)'}
          </pre>
        </section>
      ))}

      {d.logPath && (
        <section className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Log · <span className="font-mono normal-case">{d.logPath}</span>
          </h4>
          {d.logTail.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">The log is empty or missing.</p>
          ) : (
            <pre className="selectable max-h-56 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap text-foreground">
              {d.logTail.join('\n')}
            </pre>
          )}
        </section>
      )}
    </div>
  );
};
