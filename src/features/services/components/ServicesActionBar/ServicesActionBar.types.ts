export interface ServicesActionBarProps {
  hasBrew: boolean;
  runningCount: number;
  allStopped: boolean;
  busy: boolean;
  onStartAll: () => void;
  onStopAll: () => void;
  onAdd: () => void;
}
