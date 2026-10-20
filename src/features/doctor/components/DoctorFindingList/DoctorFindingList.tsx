import { FindingCard } from '@/features/doctor/components/FindingCard';
import { DoctorBrowserSections } from '@/features/doctor/components/DoctorBrowserSections';
import type { DoctorFindingListProps } from './DoctorFindingList.types';

export const DoctorFindingList = ({
  browserGroups,
  rows,
  isOverview,
  childrenOf,
  findingKey,
}: DoctorFindingListProps) => (
  <div className="overflow-y-auto">
    {browserGroups ? (
      <DoctorBrowserSections
        groups={browserGroups}
        isOverview={isOverview}
        childrenOf={childrenOf}
        findingKey={findingKey}
      />
    ) : (
      rows.map((f) => (
        <FindingCard
          key={findingKey(f)}
          finding={f}
          subFindings={isOverview(f) ? childrenOf(f) : undefined}
        />
      ))
    )}
  </div>
);
