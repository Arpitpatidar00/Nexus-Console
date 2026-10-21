import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Dialog } from '@/shared/ui/Dialog';
import { Button } from '@/shared/ui/Button';
import { Switch } from '@/shared/ui/Switch';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Spinner } from '@/shared/ui/Spinner';
import { useRemoveHost, useUpdateHost } from '@/features/remote/api/remoteMutations';
import type { RemoteHost } from '@/features/remote/api/remote.schema';
import { hostAddress } from '@/features/remote/utils/host';
import { EnvField, ProjectField, TextField } from '@/features/remote/components/HostFields';

/** Label, project, env and auto-connect. Where the host points is fixed: re-import or
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
  const [autoConnect, setAutoConnect] = useState(host.autoConnect ?? false);

  const save = () =>
    update.mutate(
      {
        id: host.id,
        patch: {
          label: label.trim(),
          project: project.trim() || 'Ungrouped',
          env,
          autoConnect,
        },
      },
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

        <div className="flex flex-col gap-1.5 rounded-lg border border-hairline bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-foreground">
                Connect when Stackroost opens
              </span>
              <span className="text-[11px] text-muted-foreground">
                Automatically check this server on startup
              </span>
            </div>
            <Switch
              checked={autoConnect}
              onChange={setAutoConnect}
              ariaLabel="Connect when Stackroost opens"
            />
          </div>
          {autoConnect && env === 'prod' && (
            <p className="mt-1 text-[11px] leading-relaxed font-medium text-warning">
              Warning: This will establish an SSH connection automatically to production on
              application launch.
            </p>
          )}
        </div>

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
