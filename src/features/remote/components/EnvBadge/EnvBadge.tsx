import { cn } from '@/shared/lib/cn';
import type { HostEnv } from '@/features/remote/api/remote.schema';

const META: Record<HostEnv, { label: string; cls: string }> = {
  dev: { label: 'Dev', cls: 'border-border text-fg-muted' },
  staging: { label: 'Staging', cls: 'border-border text-fg-muted' },
  other: { label: 'Other', cls: 'border-border text-fg-subtle' },
  // Prod is the one environment that must never be mistaken for another:
  // danger token plus the word itself, so it doesn't rely on colour.
  prod: { label: 'PROD', cls: 'border-danger/40 bg-danger-soft font-semibold text-danger' },
};

export const EnvBadge = ({ env }: { env: HostEnv }) => (
  <span
    className={cn(
      'inline-flex shrink-0 items-center rounded-full border px-1.5 py-px text-[11px] leading-4',
      META[env].cls,
    )}
  >
    {META[env].label}
  </span>
);
