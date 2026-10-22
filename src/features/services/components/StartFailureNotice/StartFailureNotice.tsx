import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { startedRecently } from '@/shared/lib/startAttempts';
import { ServiceDiagnosisDialog } from '@/features/services/components/ServiceDiagnosisDialog';
import type { ReconciledService } from '@/shared/brew';

/** `error`, or `stopped` right after the user started it → the daemon died on
 * launch. Say so, and offer the diagnosis instead of a silent grey card. */
export const StartFailureNotice = ({ service }: { service: ReconciledService }) => {
  const [open, setOpen] = useState(false);
  const failed =
    service.status === 'error' ||
    (service.status === 'stopped' && startedRecently(service.formula));
  if (!failed) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/15"
      >
        <AlertTriangle className="size-3.5" />
        Didn&apos;t start — see why
      </button>
      <ServiceDiagnosisDialog
        formula={service.formula}
        displayName={service.displayName}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
};
