import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Dialog } from '@/shared/ui/Dialog';
import { Button } from '@/shared/ui/Button';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Spinner } from '@/shared/ui/Spinner';
import { useRemoveHost, useUpdateHost } from '@/features/remote/api/remoteMutations';
import type { RemoteHost } from '@/features/remote/api/remote.schema';
import { hostAddress } from '@/features/remote/utils/host';
import { EnvField, ProjectField, TextField } from '@/features/remote/components/HostFields';

/** Label, project and env. Where the host points is fixed: re-import or
 * re-add to change it. Mounted only while open, so state starts fresh. */
export const EditHostDialog = ({
  host,
  projects,
  onClose,
}: {
  host: RemoteHost;
  projects: string[];
  onClose: () => void;
}) => {
  const update = useUpdateHost();
  const remove = useRemoveHost();
  const [label, setLabel] = useState(host.label);
  const [project, setProject] = useState(host.project);
  const [env, setEnv] = useState(host.env);

  const save = () =>
    update.mutate(
      { id: host.id, patch: { label: label.trim(), project: project.trim() || 'Ungrouped', env } },
      { onSuccess: onClose },
    );

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Edit ${host.label}`}
      description={hostAddress(host)}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim()) save();
        }}
      >
        <TextField
          label="Name"
          maxLength={64}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <ProjectField value={project} onChange={setProject} suggestions={projects} />
        <EnvField value={env} onChange={setEnv} />
        {update.isError && <ErrorPanel error={update.error} fallback="Couldn't save" />}
        <div className="flex items-center justify-between gap-2 pt-1">
          {/* Rust asks with a native sheet; nothing on the server changes. */}
          <Button
            type="button"
            variant="dangerGhost"
            size="sm"
            disabled={remove.isPending}
            onClick={() => remove.mutate(host.id, { onSuccess: onClose })}
          >
            <Trash2 className="h-4 w-4" />
            Remove from Servers
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!label.trim() || update.isPending}>
              {update.isPending && <Spinner className="text-current" />}
              Save
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
};
