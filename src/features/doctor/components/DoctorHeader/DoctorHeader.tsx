import { Download, HardDrive, History, Stethoscope, X } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/shared/ui/Button';
import { formatTime } from '@/shared/lib/format';
import { CMD, ipc } from '@/shared/tauri';
import { buildReport } from '@/features/doctor/utils/report';
import type { DoctorHeaderProps } from './DoctorHeader.types';

export const DoctorHeader = ({
  findings,
  subtitle,
  scanning,
  deepScanning,
  heroState,
  onScan,
  onDeepScan,
  onCancelScan,
  onCancelDeepScan,
  onOpenJournal,
}: DoctorHeaderProps) => {
  const exportReport = () => {
    void ipc(
      CMD.DOCTOR_EXPORT,
      { content: buildReport(findings, formatTime(Date.now())) },
      z.string(),
    )
      .then((path) => toast.success('Report saved to Desktop', { description: path }))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Export failed'));
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
      <div>
        <h1 className="text-lg font-semibold text-fg">Doctor</h1>
        <p className="text-sm text-fg-muted tabular-nums">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="History"
          title="Every change the app has made"
          onClick={onOpenJournal}
        >
          <History className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Export report"
          title="Save a markdown report to the Desktop"
          disabled={findings.length === 0}
          onClick={exportReport}
        >
          <Download className="h-4 w-4" />
        </Button>
        {scanning || deepScanning ? (
          <Button variant="dangerOutline" onClick={deepScanning ? onCancelDeepScan : onCancelScan}>
            <X className="h-4 w-4" />
            Cancel
          </Button>
        ) : (
          !heroState && (
            <>
              <Button
                variant="secondary"
                onClick={onDeepScan}
                title="Slow: the full scan plus node_modules and dev caches"
              >
                <HardDrive className="h-4 w-4" />
                Deep scan
              </Button>
              <Button onClick={onScan}>
                <Stethoscope className="h-4 w-4" />
                Scan
              </Button>
            </>
          )
        )}
      </div>
    </header>
  );
};
