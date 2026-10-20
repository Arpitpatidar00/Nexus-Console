import { CircleCheck } from 'lucide-react';
import { formatBytes } from '@/shared/lib/format';
import type { CleanSummaryBannerProps } from './CleanSummaryBanner.types';

export const CleanSummaryBanner = ({ result }: CleanSummaryBannerProps) => {
  const successCount = result.items.filter((i) => i.ok).length;
  const failCount = result.items.filter((i) => !i.ok).length;
  const hasDocker = result.items.some((i) => i.id.startsWith('docker'));

  return (
    <div className="flex items-start gap-3 rounded-xl border border-running/30 bg-running-soft px-5 py-3">
      <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-running" />
      <div className="space-y-0.5 text-sm">
        <p className="font-semibold text-fg">Freed {formatBytes(result.freedBytes)}</p>
        <p className="text-fg-muted">
          {successCount} cleaned
          {failCount > 0 && `, ${failCount} failed`}.
          {hasDocker && ' Docker may take a few minutes to shrink its disk image.'}
        </p>
      </div>
    </div>
  );
};
