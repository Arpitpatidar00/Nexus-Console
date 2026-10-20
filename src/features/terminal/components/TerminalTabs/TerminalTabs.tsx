import { X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/shared/state/hooks';
import { setActiveTerminal, closeTerminal } from '@/shared/state/terminalsSlice';
import { cn } from '@/shared/lib/cn';

export const TerminalTabs = () => {
  const dispatch = useAppDispatch();
  const sessions = useAppSelector((s) => s.terminals.sessions);
  const activeId = useAppSelector((s) => s.terminals.activeId);

  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
      {sessions.map((s) => (
        <div
          key={s.id}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-full border py-1 pr-1.5 pl-3 font-mono text-xs transition-colors select-none',
            s.id === activeId
              ? 'border-transparent bg-primary text-primary-foreground shadow-sm'
              : 'border-hairline bg-muted text-muted-foreground hover:text-foreground',
          )}
        >
          <button
            type="button"
            className="max-w-[140px] cursor-pointer truncate"
            onClick={() => dispatch(setActiveTerminal(s.id))}
          >
            {s.title}
          </button>
          <button
            type="button"
            aria-label={`Close ${s.title}`}
            onClick={() => dispatch(closeTerminal(s.id))}
            className="cursor-pointer rounded-full p-0.5 transition-colors hover:bg-black/20 dark:hover:bg-white/20"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
};
