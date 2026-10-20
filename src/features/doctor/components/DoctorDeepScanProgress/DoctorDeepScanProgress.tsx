import { motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import { PROBE_LABELS } from './DoctorDeepScanProgress.config';
import type { DoctorDeepScanProgressProps } from './DoctorDeepScanProgress.types';

export const DoctorDeepScanProgress = ({ progress, onCancel }: DoctorDeepScanProgressProps) => {
  const reduce = useReducedMotion();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-8">
      <Spinner className="h-8 w-8" />
      <div className="flex flex-col items-center gap-1 text-center">
        <h3 className="text-sm font-semibold text-fg">Deep scanning…</h3>
        <p className="text-sm text-fg-muted">
          {progress ? (PROBE_LABELS[progress.probeId] ?? 'Scanning…') : 'Starting checks…'}
        </p>
      </div>
      {/* Native <progress> (sr-only) carries the real a11y semantics —
          the project's "real input underneath" pattern. The visual fill springs
          between steps; the sheen keeps it alive while the value holds on a slow probe. */}
      <div className="relative h-1.5 w-72">
        <progress
          aria-label="Deep scan progress"
          max={progress?.total ?? 1}
          value={progress?.index ?? 0}
          className="sr-only"
        />
        <div aria-hidden className="h-full overflow-hidden rounded-full bg-list">
          <motion.div
            className="relative h-full overflow-hidden rounded-full bg-accent"
            initial={false}
            animate={{
              width: progress ? `${(progress.index / progress.total) * 100}%` : '0%',
            }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 24 }}
          >
            <span
              aria-hidden
              className="nx-progress-sheen absolute inset-y-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.45),transparent)]"
            />
          </motion.div>
        </div>
      </div>
      <p className="text-xs text-fg-subtle tabular-nums">
        {progress ? `Check ${progress.index + 1} of ${progress.total}` : ' '}
      </p>
      <Button variant="dangerOutline" onClick={onCancel}>
        <X className="h-4 w-4" />
        Cancel scan
      </Button>
    </div>
  );
};
