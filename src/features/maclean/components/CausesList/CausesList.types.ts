import type { StorageReport } from '@/features/maclean/api/maclean.schema';

export interface CausesListProps {
  causes: StorageReport['causes'];
}
