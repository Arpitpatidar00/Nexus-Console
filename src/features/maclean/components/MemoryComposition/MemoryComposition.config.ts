import type { MemoryReport } from '@/features/maclean/api/maclean.schema';

export const PRESSURE: Record<
  MemoryReport['pressure'],
  { dot: string; label: string; text: string }
> = {
  normal: { dot: 'bg-running-dot', label: 'Normal', text: 'Apps have the memory they need.' },
  warning: {
    dot: 'bg-warn-dot',
    label: 'Warning',
    text: 'macOS is compressing memory and using swap to keep up. Quitting an app you aren’t using helps.',
  },
  critical: {
    dot: 'bg-danger-dot',
    label: 'Critical',
    text: 'Memory is exhausted: expect beach balls. Quit the biggest app below.',
  },
  unknown: {
    dot: 'bg-stopped-dot',
    label: 'Unknown',
    text: 'macOS didn’t report memory pressure.',
  },
};

// Shades of the one accent (plus neutral for cache): composition, not status.
export const SEGMENTS = [
  { key: 'appBytes', label: 'App memory', cls: 'bg-ember', hint: 'What your apps are using.' },
  {
    key: 'wiredBytes',
    label: 'Wired',
    cls: 'bg-ember/70',
    hint: 'Held by macOS itself; can’t be moved.',
  },
  {
    key: 'compressedBytes',
    label: 'Compressed',
    cls: 'bg-ember/40',
    hint: 'Squeezed in RAM to avoid swapping.',
  },
  {
    key: 'cachedBytes',
    label: 'Cached files',
    cls: 'bg-fg-subtle/40',
    hint: 'Given back instantly when apps need it.',
  },
  { key: 'freeBytes', label: 'Free', cls: 'bg-list', hint: '' },
] as const;
