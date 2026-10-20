import type { DoctorProgress } from '@/features/doctor/api/doctor.schema';

export interface DoctorDeepScanProgressProps {
  progress: DoctorProgress | null;
  onCancel: () => void;
}
