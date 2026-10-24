import { X, TerminalSquare } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useAppDispatch, useAppSelector } from '@/shared/state/hooks';
import { setDrawerOpen } from '@/shared/state/terminalsSlice';
import { TerminalTabs } from '@/features/terminal/components/TerminalTabs';
import { XtermView } from '@/features/terminal/components/XtermView';

export const TerminalDrawer = () => {
  const dispatch = useAppDispatch();
  const sessions = useAppSelector((s) => s.terminals.sessions);
  const activeId = useAppSelector((s) => s.terminals.activeId);
  const drawerOpen = useAppSelector((s) => s.terminals.drawerOpen);

  if (sessions.length === 0) return null;

  return (
    <div
      className={cn(
        'z-40 flex h-72 shrink-0 flex-col rounded-t-3xl border-x border-t border-hairline shadow-float glass backdrop-blur-2xl transition-all duration-200',
        !drawerOpen && 'hidden',
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <TerminalSquare className="size-4 shrink-0 text-muted-foreground" />
          <TerminalTabs />
        </div>
        <button
          type="button"
          aria-label="Hide terminal"
          onClick={() => dispatch(setDrawerOpen(false))}
          className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-fg"
        >
          <X className="size-4" />
        </button>
      </div>
      {/* All sessions stay mounted (PTYs persist) — inactive ones hidden via visibility. */}
      <div className="relative min-h-0 flex-1">
        {sessions.map((s) => (
          <div
            key={s.id}
            className="absolute inset-0 p-2.5"
            style={{ visibility: s.id === activeId ? 'visible' : 'hidden' }}
          >
            <XtermView session={s} active={s.id === activeId} visible={drawerOpen} />
          </div>
        ))}
      </div>
    </div>
  );
};
