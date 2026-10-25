import { useState } from 'react';
import { Dialog } from '@/shared/ui/Dialog';
import { Button } from '@/shared/ui/Button';
import { useDeleteDbGroup } from '@/features/databases/api/useDatabases';
import type { DbGroup } from '@/features/databases/api/databases.schema';

interface DeleteGroupDialogProps {
  group: DbGroup | null;
  connectionCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DeleteGroupDialog = ({
  group,
  connectionCount,
  open,
  onOpenChange,
}: DeleteGroupDialogProps) => {
  const deleteGroup = useDeleteDbGroup();
  const [deleteConnections, setDeleteConnections] = useState(false);

  if (!group) return null;

  const handleConfirm = () => {
    deleteGroup.mutate(
      { id: group.id, deleteConnections },
      {
        onSuccess: () => {
          onOpenChange(false);
          setDeleteConnections(false);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete “${group.name}”?`}
      description={`This group currently contains ${connectionCount} database connection${
        connectionCount === 1 ? '' : 's'
      }.`}
      size="sm"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3 text-xs">
          <div className="flex items-start gap-2.5">
            <input
              id="policy-keep"
              type="radio"
              name="delete-policy"
              checked={!deleteConnections}
              onChange={() => setDeleteConnections(false)}
              className="mt-0.5 cursor-pointer text-primary focus:ring-primary"
            />
            <label htmlFor="policy-keep" className="flex cursor-pointer flex-col">
              <span className="font-medium text-fg">Keep connections (Recommended)</span>
              <span className="text-muted-foreground">
                The group will be deleted, but member databases will be kept and moved to Ungrouped.
                Saved credentials remain untouched.
              </span>
            </label>
          </div>

          <div className="flex items-start gap-2.5 border-t border-hairline pt-2">
            <input
              id="policy-delete"
              type="radio"
              name="delete-policy"
              checked={deleteConnections}
              onChange={() => setDeleteConnections(true)}
              className="mt-0.5 cursor-pointer text-destructive focus:ring-destructive"
            />
            <label htmlFor="policy-delete" className="flex cursor-pointer flex-col">
              <span className="font-medium text-destructive">
                Delete group and all {connectionCount} connections
              </span>
              <span className="text-muted-foreground">
                All connections inside this group will be deleted and their saved passwords removed
                from macOS Keychain.
              </span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={deleteConnections ? 'danger' : 'outline'}
            disabled={deleteGroup.isPending}
            onClick={handleConfirm}
          >
            {deleteGroup.isPending
              ? 'Deleting…'
              : deleteConnections
                ? 'Delete Group & Connections'
                : 'Delete Group'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
