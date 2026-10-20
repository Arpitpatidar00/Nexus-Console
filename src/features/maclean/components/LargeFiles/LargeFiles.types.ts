import type { StorageReport } from '@/features/maclean/api/maclean.schema';

export interface LargeFilesProps {
  files: StorageReport['largeFiles'];
}
