import { AlertCircle, RotateCw, TerminalSquare } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import type { IpcError } from '@/shared/tauri';

/** The host couldn't be reached. Says why in ssh's own words (`detail`) and
 * offers the next step that fits: Retry for network trouble, or an
 * interactive ssh in the terminal drawer for anything only the user can do
 * (accept a host key, type a passphrase). Host keys are never accepted on the
 * user's behalf. */
export const ConnectionError = ({
  error,
  onRetry,
  retrying,
  onOpenTerminal,
}: {
  error: IpcError;
  onRetry: () => void;
  retrying: boolean;
  onOpenTerminal: () => void;
}) => {
  const needsUser = error.kind === 'hostKey' || error.kind === 'auth';
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
          {needsUser && (
            <p className="text-fg-muted">
              {error.kind === 'hostKey'
                ? 'Open a terminal, check the fingerprint ssh shows with whoever runs the server, and answer yes. Then connect again.'
                : 'Open a terminal to see what ssh asks for (a passphrase, or a different key). Then connect again.'}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {needsUser && (
              <Button size="sm" onClick={onOpenTerminal}>
                <TerminalSquare className="h-3.5 w-3.5" />
                Open terminal
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={onRetry} disabled={retrying}>
              <RotateCw className="h-3.5 w-3.5" />
              {needsUser ? 'Connect again' : 'Retry'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
