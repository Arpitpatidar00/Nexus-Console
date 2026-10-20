import { FindingCard } from '@/features/doctor/components/FindingCard';
import type { DoctorBrowserSectionsProps } from './DoctorBrowserSections.types';

export const DoctorBrowserSections = ({
  groups,
  isOverview,
  childrenOf,
  findingKey,
}: DoctorBrowserSectionsProps) => (
  <>
    {groups.map(([group, items]) => (
      <div key={group}>
        <div className="border-b border-border bg-list px-4 py-2 text-xs font-semibold text-fg">
          {group}
        </div>
        {items.map((f) => (
          <FindingCard
            key={findingKey(f)}
            finding={f}
            subFindings={isOverview(f) ? childrenOf(f) : undefined}
          />
        ))}
      </div>
    ))}
  </>
);
