import { useState } from 'react';
import { Send, Cpu, CheckCircle2, AlertOctagon, ShieldAlert } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import { Dialog } from '@/shared/ui/Dialog';
import type { RemoteHost } from '@/features/remote/api/remote.schema';
import { usePushImage } from '@/features/remote/api/useTeleport';

interface Props {
  host: RemoteHost;
  open: boolean;
  onClose: () => void;
}

export const ImageTeleportDialog = ({ host, open, onClose }: Props) => {
  const [imageName, setImageName] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const pushImage = usePushImage(host.id);

  const isProd = host.env === 'prod';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageName.trim() || isProd) return;
    try {
      const res = await pushImage.mutateAsync(imageName.trim());
      setSuccessMsg(res.message);
      setImageName('');
    } catch {
      // error handled by mutation
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setSuccessMsg(null);
          onClose();
        }
      }}
      title={`Teleport Local Image to ${host.label}`}
      description="Stream a locally built Docker image directly over SSH into the remote server daemon without pushing to an external registry."
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        {isProd ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-500">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <strong className="font-semibold">Disabled on Production:</strong> Direct image
              teleportation bypasses registry audit trails and is restricted to dev and staging
              hosts. Deploy production stacks via your CI/CD registry pipeline.
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-hairline bg-muted/30 p-3 text-xs text-fg-muted">
            <Cpu className="size-4 shrink-0 text-primary" />
            <span>
              Architecture check verifies target CPU compatibility (x86_64 vs arm64) before
              streaming.
            </span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-500">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <div>
          <label
            htmlFor="teleport-image-name"
            className="mb-1 block text-xs font-medium text-fg-muted"
          >
            Local Image Tag
          </label>
          <input
            id="teleport-image-name"
            type="text"
            required
            disabled={isProd || pushImage.isPending}
            placeholder="e.g. my-app:latest or backend:dev"
            value={imageName}
            onChange={(e) => setImageName(e.target.value)}
            className="w-full rounded-xl border border-hairline bg-canvas px-3 py-2 font-mono text-xs text-fg focus:ring-1 focus:ring-primary focus:outline-none disabled:opacity-50"
          />
        </div>

        {pushImage.error && (
          <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft p-3 text-xs text-danger">
            <AlertOctagon className="mt-0.5 size-4 shrink-0" />
            <span>{pushImage.error.message}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
          {!isProd && (
            <Button type="submit" disabled={!imageName.trim() || pushImage.isPending}>
              {pushImage.isPending ? (
                <>
                  <Spinner className="mr-1.5 size-3.5 text-current" />
                  Streaming Image...
                </>
              ) : (
                <>
                  <Send className="mr-1.5 size-3.5" />
                  Push Image
                </>
              )}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
};
