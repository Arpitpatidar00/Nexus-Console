import { ArrowUp } from 'lucide-react';
import { Badge } from '@/shared/ui/Badge';

/** Compact "update available" chip — same height as the version text beside
 * it; the full wording lives in the tooltip. */
export const OutdatedBadge = ({ latestVersion }: { latestVersion: string | null }) => (
  <Badge
    variant="warning"
    size="sm"
    className="max-w-28 shrink-0 gap-1 px-1.5 font-mono text-[10px]"
    title={latestVersion ? `${latestVersion} available` : 'Update available'}
  >
    <ArrowUp className="size-3 shrink-0" />
    <span className="truncate">{latestVersion ?? 'update'}</span>
  </Badge>
);
