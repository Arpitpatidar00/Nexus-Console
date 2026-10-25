import { Check, X, AlertCircle } from 'lucide-react';
import { Dialog } from '@/shared/ui/Dialog';
import { Button } from '@/shared/ui/Button';
import type { Link, RelationCandidate } from '@/features/databases/utils/relations';
import {
  useSaveDbCustomMapping,
  useRejectDbCandidate,
} from '@/features/databases/api/useDatabases';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string | null;
  ambiguousLinks: Link[];
  connectionNames: Record<string, string>;
}

export function AmbiguousRelationsDialog({
  open,
  onOpenChange,
  groupId,
  ambiguousLinks,
  connectionNames,
}: Props) {
  const saveMapping = useSaveDbCustomMapping();
  const rejectCandidate = useRejectDbCandidate();

  const handleConfirm = (link: Link, candidate: RelationCandidate) => {
    if (!groupId || !link.fromDb) {
      toast.error('Select a specific group to persist relationship mappings.');
      return;
    }

    const fromParts = link.from.split('.');
    const fromSchema = fromParts.length > 1 ? fromParts[0] : 'public';
    const fromTable = fromParts.length > 1 ? fromParts.slice(1).join('.') : fromParts[0];

    const toParts = candidate.targetTable.split('.');
    const toSchema = toParts.length > 1 ? toParts[0] : 'public';
    const toTable = toParts.length > 1 ? toParts.slice(1).join('.') : toParts[0];

    saveMapping.mutate(
      {
        groupId,
        sourceConnectionId: link.fromDb,
        sourceSchema: fromSchema,
        sourceTable: fromTable,
        sourceColumn: link.fromColumns[0],
        targetConnectionId: candidate.targetDb,
        targetSchema: toSchema,
        targetTable: toTable,
        targetColumn: candidate.targetColumn,
        notes: `Confirmed candidate target from ${candidate.targetDbLabel}`,
      },
      {
        onSuccess: () => {
          toast.success(
            `Mapped ${fromTable}.${link.fromColumns[0]} → ${candidate.targetDbLabel}.${toTable}.${candidate.targetColumn}`,
          );
        },
        onError: (err) => {
          toast.error(`Failed to save mapping: ${(err as Error).message}`);
        },
      },
    );
  };

  const handleReject = (link: Link, candidate: RelationCandidate) => {
    if (!groupId || !link.fromDb) {
      toast.error('Select a specific group to reject candidates.');
      return;
    }

    const fromParts = link.from.split('.');
    const fromSchema = fromParts.length > 1 ? fromParts[0] : 'public';
    const fromTable = fromParts.length > 1 ? fromParts.slice(1).join('.') : fromParts[0];

    const toParts = candidate.targetTable.split('.');
    const toSchema = toParts.length > 1 ? toParts[0] : 'public';
    const toTable = toParts.length > 1 ? toParts.slice(1).join('.') : toParts[0];

    rejectCandidate.mutate(
      {
        id: `rej_${link.fromDb}_${fromTable}_${link.fromColumns[0]}_${candidate.targetDb}_${toTable}_${candidate.targetColumn}`,
        groupId,
        sourceConnectionId: link.fromDb,
        sourceSchema: fromSchema,
        sourceTable: fromTable,
        sourceColumn: link.fromColumns[0],
        targetConnectionId: candidate.targetDb,
        targetSchema: toSchema,
        targetTable: toTable,
        targetColumn: candidate.targetColumn,
      },
      {
        onSuccess: () => {
          toast.info('Candidate suggestion rejected.');
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Resolve Ambiguous Relationships"
      description="Multiple databases match these references. Select the intended target or reject suggestions so Stackroost never guesses arbitrarily."
      size="lg"
    >
      <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        {ambiguousLinks.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No ambiguous relationships found in this workspace.
          </p>
        ) : (
          ambiguousLinks.map((link) => {
            const srcDbName = link.fromDb
              ? (connectionNames[link.fromDb] ?? link.fromDb)
              : 'Source';
            return (
              <div
                key={link.id}
                className="space-y-3 rounded-lg border border-hairline bg-muted/30 p-3.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-fg">
                      {srcDbName} · {link.from}
                    </span>
                    <span className="text-xs text-muted-foreground">column</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-medium text-primary">
                      {link.fromColumns.join(', ')}
                    </code>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                    <AlertCircle className="size-3" aria-hidden />
                    {link.candidates?.length ?? 0} plausible targets
                  </span>
                </div>

                <div className="space-y-2">
                  {link.candidates?.map((candidate, idx) => (
                    <div
                      key={idx}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-hairline/60 bg-canvas px-3 py-2 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-fg">{candidate.targetDbLabel}</span>
                          <span className="font-mono text-muted-foreground">
                            {candidate.targetTable} ({candidate.targetColumn})
                          </span>
                          <span
                            className={
                              candidate.compatibility === 'compatible'
                                ? 'rounded bg-success-soft px-1.5 py-0.5 text-[10px] font-medium text-success'
                                : candidate.compatibility === 'incompatible'
                                  ? 'rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive'
                                  : 'rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground'
                            }
                          >
                            {candidate.compatibility}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{candidate.reason}</p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleConfirm(link, candidate)}
                          title="Confirm this mapping target"
                        >
                          <Check className="mr-1 size-3 text-success" />
                          Confirm
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => handleReject(link, candidate)}
                          title="Reject this suggestion"
                        >
                          <X className="mr-1 size-3" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </div>
    </Dialog>
  );
}
