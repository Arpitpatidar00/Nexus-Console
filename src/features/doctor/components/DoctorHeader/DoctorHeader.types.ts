import type { DoctorFinding } from '@/features/doctor/api/doctor.schema';

export interface DoctorHeaderProps {
  findings: DoctorFinding[];
  subtitle: string;
  scanning: boolean;
  deepScanning: boolean;
  heroState: boolean;
  onScan: () => void;
  onDeepScan: () => void;
  onCancelScan: () => void;
  onCancelDeepScan: () => void;
  onOpenJournal: () => void;
}
