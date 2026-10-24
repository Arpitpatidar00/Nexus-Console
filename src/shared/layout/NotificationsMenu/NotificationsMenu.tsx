import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { AlertCircle, Bell, CheckCircle2, Info } from 'lucide-react';
import {
  clearNotifications,
  markNotificationsSeen,
  useNotifications,
  type AppNotification,
} from '@/shared/lib/notifications';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/lib/cn';

const ICON: Record<AppNotification['kind'], React.ReactNode> = {
  error: <AlertCircle className="size-4 text-destructive" />,
  success: <CheckCircle2 className="size-4 text-success" />,
  info: <Info className="size-4 text-info" />,
};

const timeAgo = (at: number) => {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

export const NotificationsMenu = () => {
  const { items, unread } = useNotifications();

  return (
    <DropdownMenu.Root modal={false} onOpenChange={(o) => o && markNotificationsSeen()}>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="glass"
          size="icon"
          aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}
          className="relative size-11 cursor-pointer rounded-full"
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute top-2 right-2 size-2.5 rounded-full border-2 border-canvas bg-ember" />
          )}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="nx-pop z-[var(--z-dropdown)] flex max-h-[min(28rem,70vh)] w-80 flex-col rounded-xl border border-border bg-popover text-popover-foreground shadow-float"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            {items.length > 0 && (
              <button
                type="button"
                onClick={clearNotifications}
                className="cursor-pointer text-xs text-muted-foreground hover:text-fg"
              >
                Clear
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nothing yet. Finished actions and errors show up here.
            </p>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {items.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    'flex gap-3 rounded-lg px-3 py-2.5',
                    n.kind === 'error' && 'bg-danger-soft/50',
                  )}
                >
                  <span className="mt-0.5 shrink-0">{ICON[n.kind]}</span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="selectable text-[13px] leading-snug break-words">{n.title}</p>
                    <span className="text-[11px] text-muted-foreground">{timeAgo(n.at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
