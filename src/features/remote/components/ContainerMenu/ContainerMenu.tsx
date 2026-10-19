import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  MoreVertical,
  Play,
  RotateCw,
  ScrollText,
  Square,
  TerminalSquare,
  Trash2,
} from 'lucide-react';
import { useAppDispatch } from '@/shared/state/hooks';
import { openTerminal } from '@/shared/state/terminalsSlice';
import { Spinner } from '@/shared/ui/Spinner';
import type { Container, RemoteHost } from '@/features/remote/api/remote.schema';
import { useDockerAction, type DockerAction } from '@/features/remote/api/remoteMutations';
import { ProdConfirmDialog } from '@/features/remote/components/ProdConfirmDialog';

const itemCls =
  'flex w-full cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-list';

const VERB: Record<DockerAction, string> = {
  start: 'Start',
  stop: 'Stop',
  restart: 'Restart',
  remove: 'Remove',
};

/** Logs and shell open terminals (read-only and interactive respectively);
 * the rest are mutations: on prod, type-to-confirm first, then Rust's native
 * sheet. Stop and remove are styled as danger. */
export const ContainerMenu = ({
  host,
  container: c,
}: {
  host: RemoteHost;
  container: Container;
}) => {
  const dispatch = useAppDispatch();
  const action = useDockerAction(host.id);
  const [asking, setAsking] = useState<DockerAction | null>(null);
  const running = c.state === 'running' || c.state === 'restarting' || c.state === 'paused';

  const run = (a: DockerAction) => action.mutate({ container: c.name, action: a });
  const request = (a: DockerAction) => (host.env === 'prod' ? setAsking(a) : run(a));
  const term = (type: 'remoteLogs' | 'remoteExec', title: string) =>
    dispatch(openTerminal({ target: { type, hostId: host.id, container: c.name }, title }));

  return (
    <>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${c.name}`}
            disabled={action.isPending}
            className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-list hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {action.isPending ? <Spinner /> : <MoreVertical className="h-4 w-4" />}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="nx-pop z-[var(--z-dropdown)] min-w-48 rounded-lg border border-border bg-paper p-1 shadow-md"
          >
            <DropdownMenu.Item
              className={`${itemCls} text-fg`}
              onSelect={() => term('remoteLogs', `${c.name} · logs`)}
            >
              <ScrollText className="h-4 w-4 text-fg-muted" />
              Live logs
            </DropdownMenu.Item>
            {c.state === 'running' && (
              <DropdownMenu.Item
                className={`${itemCls} text-fg`}
                onSelect={() => term('remoteExec', `${c.name} · shell`)}
              >
                <TerminalSquare className="h-4 w-4 text-fg-muted" />
                Shell
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            {running ? (
              <>
                <DropdownMenu.Item
                  className={`${itemCls} text-fg`}
                  onSelect={() => request('restart')}
                >
                  <RotateCw className="h-4 w-4 text-fg-muted" />
                  Restart…
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={`${itemCls} text-danger`}
                  onSelect={() => request('stop')}
                >
                  <Square className="h-4 w-4" />
                  Stop…
                </DropdownMenu.Item>
              </>
            ) : (
              <>
                <DropdownMenu.Item
                  className={`${itemCls} text-fg`}
                  onSelect={() => request('start')}
                >
                  <Play className="h-4 w-4 text-fg-muted" />
                  Start…
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={`${itemCls} text-danger`}
                  onSelect={() => request('remove')}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove…
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {asking && (
        <ProdConfirmDialog
          hostLabel={host.label}
          title={`${VERB[asking]} ${c.name}?`}
          description={`${host.label} · PROD`}
          actionLabel={VERB[asking]}
          danger={asking === 'stop' || asking === 'remove'}
          onCancel={() => setAsking(null)}
          onConfirm={() => {
            const a = asking;
            setAsking(null);
            run(a);
          }}
        />
      )}
    </>
  );
};
