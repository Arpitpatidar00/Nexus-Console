import type { StorageReport } from '@/features/maclean/api/maclean.schema';

export interface StorageMapProps {
  report: StorageReport;
}

export interface StorageMapDrilldownProps {
  id: string;
  parentBytes: number;
}
