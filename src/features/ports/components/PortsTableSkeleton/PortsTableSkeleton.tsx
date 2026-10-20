const SKELETON_ROWS = Array.from({ length: 8 }, (_, i) => i);

export const PortsTableSkeleton = () => (
  <div className="h-full overflow-hidden" aria-hidden>
    {SKELETON_ROWS.map((i) => (
      <div key={i} className="flex items-center gap-3 border-b border-border px-3 py-3">
        <div className="h-8 flex-1 animate-pulse rounded-md bg-list" />
        <div className="h-4 w-14 animate-pulse rounded bg-list" />
        <div className="h-4 w-12 animate-pulse rounded bg-list" />
        <div className="h-4 w-10 animate-pulse rounded bg-list" />
        <div className="h-8 w-9 animate-pulse rounded-md bg-list" />
      </div>
    ))}
  </div>
);
