export const HostListSkeleton = () => (
  <div aria-hidden>
    {Array.from({ length: 5 }, (_, i) => (
      <div key={i} className="border-b border-border px-4 py-3 last:border-b-0">
        <div className="h-4 w-36 animate-pulse rounded bg-list" />
        <div className="mt-1.5 h-3 w-48 animate-pulse rounded bg-list" />
      </div>
    ))}
  </div>
);
