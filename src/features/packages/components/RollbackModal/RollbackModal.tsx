import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { RotateCcw, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { useCellarVersions, useRollbackPackage } from '@/features/packages/api/usePackagePin';

interface Props {
  pkgName: string;
  isOpen: boolean;
  onClose: () => void;
}

export const RollbackModal = ({ pkgName, isOpen, onClose }: Props) => {
  const { data: versions, isLoading } = useCellarVersions(pkgName, isOpen);
  const rollbackMutation = useRollbackPackage();
  const [selectedVersion, setSelectedVersion] = useState<string>('');

  const availableVersions = versions ?? [];
  const canRollback = availableVersions.length > 1;

  const handleRollback = () => {
    if (!selectedVersion) return;
    rollbackMutation.mutate(
      { name: pkgName, version: selectedVersion },
      {
        onSuccess: () => {
          onClose();
        },
      },
    );
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-dialog-overlay)] bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-[var(--z-dialog)] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-paper p-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-accent" />
              <Dialog.Title className="text-base font-semibold text-fg">
                Roll Back {pkgName}
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close dialog"
                className="hover:bg-hover rounded-lg p-1 text-fg-muted hover:text-fg"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-4 flex flex-col gap-4">
            {isLoading ? (
              <p className="py-4 text-center text-xs text-fg-muted">
                Inspecting Homebrew Cellar for installed versions…
              </p>
            ) : !canRollback ? (
              <div className="bg-subtle rounded-lg border border-border p-4 text-xs">
                <div className="mb-1 flex items-center gap-2 font-medium text-amber-500">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Not possible: Homebrew kept no older version</span>
                </div>
                <p className="leading-relaxed text-fg-muted">
                  Only version{' '}
                  <span className="font-mono font-semibold text-fg">
                    {availableVersions[0] ?? 'current'}
                  </span>{' '}
                  is present in the local Cellar. Older kegs were removed during Homebrew cleanup.
                  Rollback is only possible when a different keg version still exists on disk.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-fg-muted">
                  Select a previously installed keg version from the local Cellar to switch
                  symlinks:
                </p>
                <div className="flex flex-col gap-2">
                  {availableVersions.map((v, idx) => (
                    <label
                      key={v}
                      htmlFor={`version-${v}`}
                      className="hover:bg-hover flex cursor-pointer items-center justify-between rounded-lg border border-border p-3"
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          id={`version-${v}`}
                          name="rollback-version"
                          value={v}
                          checked={selectedVersion === v || (selectedVersion === '' && idx === 1)}
                          onChange={() => setSelectedVersion(v)}
                          className="h-4 w-4 border-border text-accent"
                        />
                        <span className="font-mono text-xs font-semibold text-fg">{v}</span>
                      </div>
                      {idx === 0 ? (
                        <Badge variant="neutral" className="text-[10px]">
                          Active Version
                        </Badge>
                      ) : (
                        <Badge variant="neutral" className="text-[10px]">
                          Available
                        </Badge>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            {canRollback && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleRollback}
                disabled={!selectedVersion || rollbackMutation.isPending}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                {rollbackMutation.isPending ? 'Switching…' : 'Switch Version'}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
