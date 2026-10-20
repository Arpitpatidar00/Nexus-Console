import { KeyRound, Server } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import { useSetConsent } from '@/features/remote/api/remoteMutations';

/** What "Allow" means, in full. Shared with the import dialog. */
export const ConsentCopy = () => (
  <ul className="max-w-[60ch] list-disc space-y-1.5 pl-5 text-left text-sm leading-relaxed text-fg-muted">
    <li>
      Stackroost reads <span className="font-mono text-fg">~/.ssh/config</span> (and files it
      includes) to list your hosts. It never opens your keys or{' '}
      <span className="font-mono">known_hosts</span>.
    </li>
    <li>
      Connections use your own <span className="font-mono">ssh</span>, keys and agent. Nothing
      connects until you click Connect.
    </li>
    <li>Checks are read-only. Every change on a server asks you first and is logged.</li>
    <li>No account, no server of ours, no telemetry. You can revoke this in Settings.</li>
  </ul>
);

/** First use of the Servers tab: nothing is read before the user says so. */
export const ConsentPanel = ({ onAddManually }: { onAddManually: () => void }) => {
  const consent = useSetConsent();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-list text-fg-muted">
        <Server className="h-5 w-5" />
      </span>
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-fg">See your servers from here</h2>
        <p className="text-sm text-fg-muted">
          Health, containers and services for the Linux servers you already reach with SSH.
        </p>
      </div>
      <ConsentCopy />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => consent.mutate(true)} disabled={consent.isPending}>
          {consent.isPending ? (
            <Spinner className="text-current" />
          ) : (
            <KeyRound className="h-4 w-4" />
          )}
          Allow reading SSH config
        </Button>
        <Button variant="secondary" onClick={onAddManually}>
          Add a server by hand
        </Button>
      </div>
    </div>
  );
};
