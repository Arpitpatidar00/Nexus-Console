import { cn } from '@/shared/lib/cn';

/** Placeholder bars while data loads (PLAN F.5) — the shape of what's coming,
 * never a "Loading…" sentence. */
export const Skeleton = ({ lines = 3, className }: { lines?: number; className?: string }) => (
  <div className={cn('flex flex-col gap-2 py-2', className)} aria-busy="true" aria-label="Loading">
    {Array.from({ length: lines }, (_, i) => (
      <div
        key={i}
        className="h-3.5 animate-pulse rounded bg-muted motion-reduce:animate-none"
        style={{ width: `${90 - ((i * 17) % 40)}%` }}
      />
    ))}
  </div>
);
