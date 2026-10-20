import { useState } from 'react';
import { Dialog } from '@/shared/ui/Dialog';
import { Button } from '@/shared/ui/Button';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Spinner } from '@/shared/ui/Spinner';
import { useAddManualHost } from '@/features/remote/api/remoteMutations';
import type { HostEnv } from '@/features/remote/api/remote.schema';
import { EnvField, ProjectField, TextField } from '@/features/remote/components/HostFields';

const EMPTY = { hostname: '', user: '', port: '22', identityFile: '', label: '', project: '' };

/** A server that isn't in ~/.ssh/config. Key auth only for background checks;
 * Rust validates every field again. */
export const AddHostDialog = ({
  open,
  onOpenChange,
  projects,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: string[];
  onAdded: (id: string) => void;
}) => {
  const add = useAddManualHost();
  const [f, setF] = useState(EMPTY);
  const [env, setEnv] = useState<HostEnv>('dev');
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  const close = (o: boolean) => {
    if (!o) {
      setF(EMPTY);
      setEnv('dev');
      add.reset();
    }
    onOpenChange(o);
  };

  const port = Number(f.port);
  const valid =
    f.hostname.trim() !== '' &&
    f.user.trim() !== '' &&
    Number.isInteger(port) &&
    port > 0 &&
    port < 65536;

  const submit = () =>
    add.mutate(
      {
        hostname: f.hostname.trim(),
        user: f.user.trim(),
        port,
        identityFile: f.identityFile.trim() || undefined,
        label: f.label.trim() || undefined,
        project: f.project.trim() || undefined,
        env,
      },
      {
        onSuccess: (host) => {
          onAdded(host.id);
          close(false);
        },
      },
    );

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Add a server"
      description="For hosts that aren't in your SSH config. Your key must be in the agent, or set below."
    >
      <form
        className="space-y-3 overflow-y-auto"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) submit();
        }}
      >
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <TextField
            label="Hostname or IP"
            placeholder="api.example.com"
            value={f.hostname}
            onChange={set('hostname')}
          />
          <TextField label="Port" inputMode="numeric" value={f.port} onChange={set('port')} />
        </div>
        <TextField label="User" placeholder="ubuntu" value={f.user} onChange={set('user')} />
        <TextField
          label="Key file (optional)"
          placeholder="~/.ssh/id_ed25519"
          hint="Passed to ssh -i. Stackroost never reads the file."
          value={f.identityFile}
          onChange={set('identityFile')}
        />
        <TextField
          label="Name (optional)"
          placeholder="Shown in the list"
          maxLength={64}
          value={f.label}
          onChange={set('label')}
        />
        <ProjectField
          value={f.project}
          onChange={(v) => setF((p) => ({ ...p, project: v }))}
          suggestions={projects}
        />
        <EnvField value={env} onChange={setEnv} />
        {add.isError && <ErrorPanel error={add.error} fallback="Couldn't add this server" />}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!valid || add.isPending}>
            {add.isPending && <Spinner className="text-current" />}
            Add server
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
