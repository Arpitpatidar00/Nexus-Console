import type { ArchiverRow } from '@/features/archiver/components/ProjectDetail';

export interface ArchiverProjectsListProps {
  rows: ArchiverRow[];
  selectedId: string | null;
  isPending: boolean;
  onSelect: (id: string) => void;
}
