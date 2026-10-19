import { useState } from 'react';
import { AlertCircle, Check, Copy, RotateCw } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import type { IpcError } from '@/shared/tauri';
import type { RemoteHost } from '@/features/remote/api/remote.schema';
import { sshCommand } from '@/features/remote/utils/host';

/** The host couldn't be reached. Says why in ssh's own words (`detail`) and
 * offers the one next step that fits: Retry for network trouble, or a
 * Terminal command for anything only the user can do (accept a host key,
 * unlock a key). Host keys are never accepted on the user's behalf. */
// ponytail: P5 swaps the copy button for "Open terminal" (in-app PTY).
export const ConnectionError = ({
  host,
  error,
  onRetry,
  retrying,
}: {
  host: RemoteHost;
  error: IpcError;
  onRetry: () => void;
  retrying: boolean;
}) => {
  const [copied, setCopied] = useState(false);
  const needsUser = error.kind === 'hostKey' || error.kind === 'auth';
  const cmd = sshCommand(host);
  const copy = () =>
    void navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });

  return (
    <div className="p-5">
      <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <div className="min-w-0 flex-1 space-y-3 text-sm">
          <div className="space-y-1">
            <p className="font-medium text-fg">{error.message}</p>
            {error.detail && error.detail !== error.message && (
              <p className="font-mono text-xs break-words text-fg-muted">{error.detail}</p>
            )}
          </div>
          {needsUser ? (
            <div className="space-y-2">
              <p className="text-fg-muted">
                {error.kind === 'hostKey'
                  ? 'Run this in Terminal, check the fingerprint with whoever runs the server, and answer yes. Then connect again.'
                  : 'Run this in Terminal to see what ssh asks for (a passphrase, or a different key). Then connect again.'}
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-paper px-2.5 py-1.5 font-mono text-xs text-fg">
                  {cmd}
                </code>
                <Button size="sm" variant="secondary" onClick={copy} aria-label="Copy command">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <Button size="sm" variant="secondary" onClick={onRetry} disabled={retrying}>
                <RotateCw className="h-3.5 w-3.5" />
                Connect again
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={onRetry} disabled={retrying}>
              <RotateCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
