import type { DeepCategory, DeepReport, DeepSubItem } from '@/features/maclean/api/maclean.schema';

export interface DeepScanCardProps {
  unexplainedBytes: number;
  dataUsedBytes: number;
}

export interface DeepScanCategoryRowProps {
  category: DeepCategory;
  dataUsedBytes: number;
  isOpen: boolean;
  onToggle: () => void;
  onRescan?: () => void;
}

export interface DeepScanSubItemRowProps {
  subItem: DeepSubItem;
  categorySeverity: DeepCategory['severity'];
}

export interface DeepScanEntryRowProps {
  entry: DeepReport['entries'][number];
  dataUsedBytes: number;
}
