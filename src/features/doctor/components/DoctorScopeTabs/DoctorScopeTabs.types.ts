import type { DoctorScope } from '@/features/doctor/api/doctor.schema';

export type ScopeTab = 'all' | DoctorScope;

export interface ScopeTabOption {
  value: ScopeTab;
  label: string;
}

export interface DoctorScopeTabsProps {
  tabs: ScopeTabOption[];
  activeTab: ScopeTab;
  onSelectTab: (tab: ScopeTab) => void;
}
