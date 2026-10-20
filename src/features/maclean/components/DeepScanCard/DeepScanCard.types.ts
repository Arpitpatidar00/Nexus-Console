import type { DeepReport } from '@/features/maclean/api/maclean.schema';

export interface DeepScanCardProps {
  unexplainedBytes: number;
  dataUsedBytes: number;
}

export interface DeepScanEntryRowProps {
  entry: DeepReport['entries'][number];
  dataUsedBytes: number;
}
