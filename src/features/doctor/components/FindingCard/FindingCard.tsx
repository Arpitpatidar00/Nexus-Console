import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronRight, ExternalLink, Wrench } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { IpcError } from '@/shared/tauri';
import { useAppDispatch } from '@/shared/state/hooks';
import { setActiveTab } from '@/shared/state/uiSlice';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import { Badge } from '@/shared/ui/Badge';
import { fixMeta, useDoctorFix } from '@/features/doctor/api/useDoctorFix';
import type { DoctorFinding } from '@/features/doctor/api/doctor.schema';
import type { FindingCardProps } from './FindingCard.types';

const DOT: Record<DoctorFinding['severity'], string> = {
  red: 'bg-destructive',
  yellow: 'bg-warning',
  green: 'bg-success',
};

const TAG_LABEL: Record<DoctorFinding['tag'], string> = {
  speed: 'Speed',
  storage: 'Storage',
  info: 'Info',
};

const DISK_OVERLAP_FIXES = new Set([
  'deep_dead_node_modules',
  'deep_stale_node_modules',
  'pnpm_orphan_stores',
  'cache_npm',
  'cache_uv',
  'cache_huggingface',
  'cache_puppeteer',
  'cache_gradle',
  'cache_deriveddata',
]);

/** One report line: severity dot + one-line summary + honest tag. */
export const FindingCard = ({ finding, subFindings }: FindingCardProps) => {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const dispatch = useAppDispatch();
  const fix = useDoctorFix();
  const reduce = useReducedMotion();
  const meta = fixMeta(finding.fix);

  const isMemoryFinding =
    finding.probeId.toLowerCase().includes('memory') ||
    finding.probeId.toLowerCase().includes('swap');
  const isDiskOverlap =
    (finding.fix && DISK_OVERLAP_FIXES.has(finding.fix)) ||
    (finding.tag === 'storage' && finding.scope === 'disk');

  const expandable =
    finding.severity !== 'green' ||
    meta != null ||
    isMemoryFinding ||
    isDiskOverlap ||
    (finding.guide?.length ?? 0) > 0 ||
    (subFindings?.length ?? 0) > 0;
  const destructive = meta != null && /^(Delete|Clear|Uninstall)/.test(meta.label);

  const [title, ...metaParts] = finding.summary.split(' · ');
  const metaLine = metaParts.join(' · ');

  const runFix = async () => {
    try {
      setResult(await fix.mutateAsync({ fixId: finding.fix as string }));
    } catch {
      /* fix.isError renders below (cancelled stays silent) */
    }
  };

  return (
    <div
      className={cn(
        'border-b border-hairline transition-colors last:border-b-0',
        open && 'bg-muted/40',
      )}
    >
      <button
        type="button"
        onClick={expandable ? () => setOpen((o) => !o) : undefined}
        aria-expanded={expandable ? open : undefined}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          expandable ? 'cursor-pointer hover:bg-glass-strong' : 'cursor-default',
        )}
      >
        <span className={cn('size-2.5 shrink-0 rounded-full', DOT[finding.severity])} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{title}</span>
          {metaLine && (
            <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground tabular-nums">
              {metaLine}
            </span>
          )}
        </span>
        <Badge tone="neutral" size="sm" className="shrink-0">
          {TAG_LABEL[finding.tag]}
        </Badge>
        {expandable ? (
          <ChevronRight
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform duration-150',
              open && 'rotate-90',
            )}
          />
        ) : (
          <span aria-hidden className="size-4 shrink-0" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={
              reduce
                ? { duration: 0.1 }
                : { type: 'spring', stiffness: 450, damping: 35, mass: 0.8 }
            }
            className="overflow-hidden border-t border-hairline bg-card/60 px-5 pt-4 pb-5"
          >
            {finding.explain && (
              <p className="text-sm leading-relaxed text-muted-foreground">{finding.explain}</p>
            )}

            {subFindings && subFindings.length > 0 && (
              <div className="mt-3 divide-y divide-hairline rounded-lg border border-hairline bg-muted/30">
                {subFindings.map((sf) => (
                  <div key={sf.summary} className="flex items-center gap-2.5 px-3 py-2 text-xs">
                    <span className={cn('size-1.5 shrink-0 rounded-full', DOT[sf.severity])} />
                    <span className="truncate font-mono text-foreground">{sf.summary}</span>
                  </div>
                ))}
              </div>
            )}

            {finding.guide && finding.guide.length > 0 && (
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
                {finding.guide.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {isDiskOverlap && (
                <Button size="sm" variant="glass" onClick={() => dispatch(setActiveTab('storage'))}>
                  <ExternalLink className="size-3.5" />
                  Review in Mac Clean
                </Button>
              )}

              {isMemoryFinding && (
                <Button size="sm" variant="glass" onClick={() => dispatch(setActiveTab('memory'))}>
                  <ExternalLink className="size-3.5" />
                  Review in Mac Clean Memory
                </Button>
              )}

              {meta && (
                <Button
                  size="sm"
                  variant={destructive ? 'danger' : 'ember'}
                  disabled={fix.isPending}
                  onClick={() => void runFix()}
                >
                  {fix.isPending ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <Wrench className="size-3.5" />
                  )}
                  {meta.label}
                </Button>
              )}

              {result && <span className="font-mono text-xs text-success">{result}</span>}
              {fix.isError && fix.error instanceof IpcError && fix.error.kind !== 'cancelled' && (
                <span className="font-mono text-xs text-destructive">{fix.error.message}</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
