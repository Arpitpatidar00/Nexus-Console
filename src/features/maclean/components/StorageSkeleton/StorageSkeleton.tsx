export const StorageSkeleton = () => (
  <div aria-hidden className="space-y-4">
    <div className="h-20 animate-pulse rounded-xl bg-list" />
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="h-80 animate-pulse rounded-xl bg-list" />
      <div className="h-80 animate-pulse rounded-xl bg-list" />
    </div>
  </div>
);
