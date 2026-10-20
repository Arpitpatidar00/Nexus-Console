import { useState } from 'react';
import { Files, Trash2, Search, CheckCircle2, Copy } from 'lucide-react';
import { formatBytes } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { useDuplicateFiles, useDeleteDuplicates } from '@/features/maclean/api/useMacHealth';

export const DuplicateFilesCard = () => {
  const [hasScanned, setHasScanned] = useState(false);
  const { data: report, isFetching, refetch } = useDuplicateFiles(undefined, false);
  const deleteMutation = useDeleteDuplicates();
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const handleStartScan = () => {
    setHasScanned(true);
    void refetch();
  };

  const groups = report?.groups ?? [];

  const toggleSelectPath = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleDelete = () => {
    const paths = Array.from(selectedPaths);
    if (paths.length === 0) return;
    deleteMutation.mutate(paths, {
      onSuccess: () => {
        setSelectedPaths(new Set());
        void refetch();
      },
    });
  };

  // Calculate selected bytes across chosen copies
  const selectedBytes = groups.reduce((acc, g) => {
    const countInGroup = g.files.filter((f) => selectedPaths.has(f.path)).length;
    return acc + countInGroup * g.sizeBytes;
  }, 0);

  return (
    <div className="rounded-xl border border-border bg-paper p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-accent-soft flex h-10 w-10 items-center justify-center rounded-lg text-accent">
            <Files className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-fg">Duplicate Files</h3>
            <p className="text-xs text-fg-muted">
              Fast BLAKE3 size + 64 KB partial hash scan in Downloads, Desktop & Documents (≥ 1 MB)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!hasScanned ? (
            <Button type="button" variant="primary" size="sm" onClick={handleStartScan}>
              <Search className="mr-1.5 h-3.5 w-3.5" />
              Scan for Duplicates
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void refetch()}
                disabled={isFetching}
              >
                {isFetching ? 'Scanning…' : 'Rescan'}
              </Button>
              {selectedPaths.size > 0 && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  {deleteMutation.isPending
                    ? 'Moving to Trash…'
                    : `Trash Selected (${formatBytes(selectedBytes)})`}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {!hasScanned ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Copy className="mb-2 h-8 w-8 text-fg-muted" />
          <p className="text-sm font-medium text-fg">Report-First Duplicate Detection</p>
          <p className="mt-1 max-w-md text-xs text-fg-muted">
            Click scan to inspect your personal folders for duplicate files. No files are modified
            or deleted automatically; you choose exactly which copies to keep.
          </p>
        </div>
      ) : isFetching ? (
        <div className="py-8 text-center text-sm text-fg-muted">
          Scanning files ≥ 1 MB and computing BLAKE3 cryptographic hashes…
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500" />
          <p className="text-sm font-medium text-fg">No Duplicate Files Found</p>
          <p className="mt-1 text-xs text-fg-muted">
            Scanned {report?.scannedFilesCount ?? 0} files. No redundant copies ≥ 1 MB detected.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between text-xs text-fg-muted">
            <span>
              Found {groups.length} duplicate groups across {report?.scannedFilesCount ?? 0} files (
              {formatBytes(report?.totalReclaimableBytes ?? 0)} reclaimable)
            </span>
            <span className="text-[11px] text-fg-muted">
              Select redundant copies to move to .Trash
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {groups.map((group) => (
              <div
                key={group.hash}
                className="bg-subtle flex flex-col gap-2 rounded-lg border border-border p-3"
              >
                <div className="flex items-center justify-between border-b border-border/50 pb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral" className="font-mono text-[10px]">
                      {group.files.length} copies
                    </Badge>
                    <span className="text-xs font-semibold text-fg">
                      {formatBytes(group.sizeBytes)} each
                    </span>
                  </div>
                  <span className="max-w-xs truncate font-mono text-[10px] text-fg-muted">
                    BLAKE3: {group.hash.slice(0, 16)}…
                  </span>
                </div>

                <div className="divide-y divide-border/40">
                  {group.files.map((file, idx) => (
                    <div
                      key={file.path}
                      className="hover:bg-hover flex items-center justify-between rounded px-1 py-2 text-xs transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          id={`dup-${file.path}`}
                          checked={selectedPaths.has(file.path)}
                          onChange={() => toggleSelectPath(file.path)}
                          className="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent"
                        />
                        <div>
                          <label
                            htmlFor={`dup-${file.path}`}
                            className="cursor-pointer font-medium text-fg"
                          >
                            {file.path.split('/').pop()}
                          </label>
                          <p className="max-w-lg truncate font-mono text-[11px] text-fg-muted">
                            {file.path}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-fg-muted">
                          {file.modifiedAt > 0
                            ? new Date(file.modifiedAt * 1000).toLocaleDateString()
                            : ''}
                        </span>
                        {idx === 0 && (
                          <Badge variant="neutral" className="ml-2 text-[9px]">
                            Copy 1
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
