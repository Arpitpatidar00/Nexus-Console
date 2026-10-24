import { useState } from 'react';
import { Dialog } from '@/shared/ui/Dialog';
import { Button } from '@/shared/ui/Button';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Spinner } from '@/shared/ui/Spinner';
import { Checkbox } from '@/shared/ui/Checkbox';
import { useAddTunnel } from '@/features/remote/api/tunnelMutations';
import { splitHostPort } from '@/features/remote/utils/host';
import type { RemoteHost } from '@/features/remote/api/remote.schema';
import { TextField } from '@/features/remote/components/HostFields';

interface AddTunnelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hosts: RemoteHost[];
  defaultHostId?: string;
  onAdded?: (id: string) => void;
}

export const AddTunnelDialog = ({
  open,
  onOpenChange,
  hosts,
  defaultHostId,
  onAdded,
}: AddTunnelDialogProps) => {
  const add = useAddTunnel();
  const [hostId, setHostId] = useState(defaultHostId || hosts[0]?.id || '');
  const [name, setName] = useState('');
  const [localPort, setLocalPort] = useState('5433');
  const [remoteHost, setRemoteHost] = useState('127.0.0.1');
  const [remotePort, setRemotePort] = useState('5432');
  const [autoStart, setAutoStart] = useState(false);

  const close = (o: boolean) => {
    if (!o) {
      setName('');
      setLocalPort('5433');
      setRemoteHost('127.0.0.1');
      setRemotePort('5432');
      setAutoStart(false);
      add.reset();
    }
    onOpenChange(o);
  };

  const lPort = Number(localPort);
  const rPort = Number(remotePort);
  const valid =
    hostId.trim() !== '' &&
    name.trim() !== '' &&
    Number.isInteger(lPort) &&
    lPort > 0 &&
    lPort < 65536 &&
    Number.isInteger(rPort) &&
    rPort > 0 &&
    rPort < 65536;

  const submit = () => {
    add.mutate(
      {
        hostId,
        name: name.trim(),
        localPort: lPort,
        remoteHost: remoteHost.trim() || '127.0.0.1',
        remotePort: rPort,
        autoStart,
      },
      {
        onSuccess: (tunnel) => {
          onAdded?.(tunnel.id);
          close(false);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Create SSH Tunnel"
      description="Forward a local port to a remote service over SSH. Local traffic binds strictly to 127.0.0.1."
    >
      <form
        className="space-y-4 overflow-y-auto"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) submit();
        }}
      >
        <div className="space-y-1.5">
          <label htmlFor="target-server-select" className="text-xs font-medium text-fg">
            Target Server
          </label>
          <select
            id="target-server-select"
            value={hostId}
            onChange={(e) => setHostId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-fg outline-none focus:border-ring"
          >
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.label} ({h.env})
              </option>
            ))}
          </select>
        </div>

        <TextField
          label="Tunnel Name"
          placeholder="e.g. Postgres DB, Redis Cache"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={64}
        />

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Local Port"
            placeholder="5433"
            inputMode="numeric"
            value={localPort}
            onChange={(e) => setLocalPort(e.target.value)}
            hint="Binds to 127.0.0.1"
          />
          <TextField
            label="Remote Port"
            placeholder="5432"
            inputMode="numeric"
            value={remotePort}
            onChange={(e) => setRemotePort(e.target.value)}
          />
        </div>

        <TextField
          label="Remote Target Host"
          placeholder="127.0.0.1"
          value={remoteHost}
          onChange={(e) => {
            // A pasted `127.0.0.1:4101` fills both fields instead of failing as a hostname.
            const { host, port } = splitHostPort(e.target.value);
            if (port != null) {
              setRemoteHost(host);
              setRemotePort(String(port));
            } else {
              setRemoteHost(e.target.value);
            }
          }}
          hint="As seen from the server, usually 127.0.0.1. Pasting host:port fills Remote Port too."
        />

        <div className="flex items-center gap-2.5 pt-1">
          <Checkbox
            ariaLabel="Auto-start tunnel when Stackroost connects"
            checked={autoStart}
            onChange={setAutoStart}
          />
          <button
            type="button"
            className="cursor-pointer border-none bg-transparent p-0 text-left text-xs text-fg"
            onClick={() => setAutoStart(!autoStart)}
          >
            Auto-start tunnel when Stackroost connects
          </button>
        </div>

        {add.isError && <ErrorPanel error={add.error} fallback="Could not create SSH tunnel" />}

        <div className="flex justify-end gap-2 border-t border-hairline pt-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!valid || add.isPending}>
            {add.isPending && <Spinner className="text-current" />}
            Create Tunnel
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
