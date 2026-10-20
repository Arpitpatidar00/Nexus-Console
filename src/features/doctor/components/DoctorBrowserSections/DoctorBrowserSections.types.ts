import type { DoctorFinding } from '@/features/doctor/api/doctor.schema';

export interface DoctorBrowserSectionsProps {
  groups: ReadonlyArray<readonly [string, DoctorFinding[]]>;
  isOverview: (f: DoctorFinding) => boolean;
  childrenOf: (f: DoctorFinding) => DoctorFinding[];
  findingKey: (f: DoctorFinding) => string;
}
