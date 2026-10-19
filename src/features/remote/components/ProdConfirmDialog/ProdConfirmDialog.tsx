import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Dialog } from '@/shared/ui/Dialog';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/features/remote/components/HostFields';

/** The first of two confirms for any change on a prod server: type the
 * server's name. The native sheet in Rust is the second, and the one the
 * frontend can't skip. Mounted only while asking, so the field starts empty. */
export const ProdConfirmDialog = ({
  hostLabel,
  title,
  description,
  actionLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  hostLabel: string;
  title: string;
  description: string;
  actionLabel: string;
  danger: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => {
  const [typed, setTyped] = useState('');
  const ok = typed.trim() === hostLabel;
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()} title={title} description={description}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onConfirm();
        }}
      >
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>This is a production server.</span>
        </div>
        <TextField
          label={`Type “${hostLabel}” to continue`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          aria-invalid={typed !== '' && !ok}
        />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} size="sm" disabled={!ok}>
            {actionLabel}…
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
