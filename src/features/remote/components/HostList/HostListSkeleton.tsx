export const HostListSkeleton = () => (
  <div aria-hidden className="space-y-0.5">
    {Array.from({ length: 5 }, (_, i) => (
      <div key={i} className="flex items-center gap-3 px-3 py-2.5">
        <div className="size-8 shrink-0 animate-pulse rounded-lg bg-list" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="h-3.5 w-32 animate-pulse rounded bg-list" />
          <div className="h-3 w-44 animate-pulse rounded bg-list" />
        </div>
      </div>
    ))}
  </div>
);
