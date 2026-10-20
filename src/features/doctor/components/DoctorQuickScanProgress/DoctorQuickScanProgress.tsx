import { X } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';

export interface DoctorQuickScanProgressProps {
  onCancel: () => void;
}

export const DoctorQuickScanProgress = ({ onCancel }: DoctorQuickScanProgressProps) => (
  <div className="flex h-full flex-col items-center justify-center gap-5 p-8">
    <Spinner className="h-8 w-8" />
    <div className="flex flex-col items-center gap-1 text-center">
      <h3 className="text-sm font-semibold text-fg">Scanning…</h3>
      <p className="text-sm text-fg-muted">Running read-only checks across your Mac.</p>
    </div>
    <Button variant="dangerOutline" onClick={onCancel}>
      <X className="h-4 w-4" />
      Cancel scan
    </Button>
  </div>
);
