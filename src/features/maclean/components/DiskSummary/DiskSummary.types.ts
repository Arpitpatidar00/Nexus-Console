import type { CleanJournal, StorageReport } from '@/features/maclean/api/maclean.schema';

export interface DiskSummaryProps {
  disk: StorageReport['disk'];
  lastClean?: CleanJournal[number];
}
