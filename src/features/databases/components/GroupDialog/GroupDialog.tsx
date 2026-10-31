import { useState } from 'react';
import { Dialog } from '@/shared/ui/Dialog';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Field';
import { useCreateDbGroup, useUpdateDbGroup } from '@/features/databases/api/useDatabases';
import type { DbGroup } from '@/features/databases/api/databases.schema';

const COLOR_SWATCHES = [
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Rose', hex: '#ef4444' },
  { name: 'Sky', hex: '#0ea5e9' },
  { name: 'Violet', hex: '#8b5cf6' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Slate', hex: '#64748b' },
];

interface GroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group?: DbGroup | null;
}

export const GroupDialog = ({ open, onOpenChange, group }: GroupDialogProps) => {
  const createGroup = useCreateDbGroup();
  const updateGroup = useUpdateDbGroup();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLOR_SWATCHES[0].hex);

  // Reset on (re)open or a different group, during render rather than in an
  // effect's second pass.
  const [syncedFrom, setSyncedFrom] = useState<{ group: typeof group; open: boolean } | null>(null);
  if (!syncedFrom || syncedFrom.group !== group || syncedFrom.open !== open) {
    setSyncedFrom({ group, open });
    setName(group?.name ?? '');
    setDescription(group?.description ?? '');
    setColor(group?.color ?? COLOR_SWATCHES[0].hex);
  }

  const isEditing = Boolean(group);
  const isPending = createGroup.isPending || updateGroup.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (isEditing && group) {
      updateGroup.mutate(
        {
          id: group.id,
          name: name.trim(),
          description: description.trim() || undefined,
          color,
        },
        {
          onSuccess: () => onOpenChange(false),
        },
      );
    } else {
      createGroup.mutate(
        {
          name: name.trim(),
          description: description.trim() || undefined,
          color,
        },
        {
          onSuccess: () => onOpenChange(false),
        },
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? `Edit “${group?.name}”` : 'Create Workspace Group'}
      description="Organize multiple microservice databases (e.g. Postgres, Mongo, Redis) under one unified cluster."
      size="sm"
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Group Name" htmlFor="group-name">
          <Input
            id="group-name"
            required
            placeholder="e.g. Fameo Workspace"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field label="Description" hint="Optional" htmlFor="group-desc">
          <Input
            id="group-desc"
            placeholder="e.g. Production microservice data layer"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-fg">Accent Color</span>
          <div className="flex flex-wrap gap-2">
            {COLOR_SWATCHES.map((swatch) => (
              <button
                key={swatch.hex}
                type="button"
                aria-label={swatch.name}
                onClick={() => setColor(swatch.hex)}
                className={`size-7 rounded-full transition-transform focus:outline-none ${
                  color === swatch.hex
                    ? 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-canvas'
                    : 'hover:scale-105'
                }`}
                style={{ backgroundColor: swatch.hex }}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="ember" disabled={isPending || !name.trim()}>
            {isPending ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Group'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
