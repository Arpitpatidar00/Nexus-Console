import type { SegmentOption } from '@/shared/ui/SegmentedControl';

/** Milliseconds as strings (SegmentedControl values are strings). 0 = manual. */
export const REMOTE_POLL_OPTIONS: SegmentOption<string>[] = [
  { value: '5000', label: '5s' },
  { value: '10000', label: '10s' },
  { value: '30000', label: '30s' },
  { value: '0', label: 'Manual' },
];

/** Minutes as strings. 0 = off (the default: background work is opt-in). */
export const REMOTE_BACKGROUND_OPTIONS: SegmentOption<string>[] = [
  { value: '0', label: 'Off' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '30', label: '30m' },
];
