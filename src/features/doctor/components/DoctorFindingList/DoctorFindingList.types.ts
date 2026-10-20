import type { DoctorFinding } from '@/features/doctor/api/doctor.schema';

export interface DoctorFindingListProps {
  browserGroups: ReadonlyArray<readonly [string, DoctorFinding[]]> | null;
  rows: DoctorFinding[];
  isOverview: (f: DoctorFinding) => boolean;
  childrenOf: (f: DoctorFinding) => DoctorFinding[];
  findingKey: (f: DoctorFinding) => string;
}
