import type { MemoryReport } from '@/features/maclean/api/maclean.schema';
import type { MemSample } from '@/features/maclean/utils/memory';

export interface MemoryCompositionProps {
  report: MemoryReport;
  history: MemSample[];
}
