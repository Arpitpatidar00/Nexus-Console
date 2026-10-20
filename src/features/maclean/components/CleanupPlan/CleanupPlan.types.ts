import type { CleanEvent, CleanItem } from '@/features/maclean/api/maclean.schema';

export type LiveCleanEvents = Record<string, CleanEvent>;

export interface CleanupPlanProps {
  items: CleanItem[];
  cleaning: boolean;
  onClean: (ids: string[]) => void;
}

export interface CleanupPlanRowProps {
  item: CleanItem;
  live?: CleanEvent;
  selected: boolean;
  expanded: boolean;
  cleaning: boolean;
  onToggleSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
}

export interface CleanupPlanStatusProps {
  item: CleanItem;
  live?: CleanEvent;
}
