import React from 'react';
import { Search } from 'lucide-react';
import { useAppSelector } from '@/shared/state/hooks';
import { useVisibleNav } from '@/shared/modules';
import { ThemeToggle } from '@/shared/layout/ThemeToggle';
import { NotificationsMenu } from '@/shared/layout/NotificationsMenu';

interface HeaderProps {
  onOpenCommand: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenCommand }) => {
  const activeTab = useAppSelector((s) => s.ui.activeTab);
  const navItems = useVisibleNav();

  const currentNav = navItems.find((n) => n.tab === activeTab);
  const title = currentNav ? currentNav.label : 'Stackroost';

  return (
    <header
      data-tauri-drag-region
      className="flex h-[72px] shrink-0 items-center justify-between gap-4 px-1 select-none"
    >
      {/* Title & subtitle on left */}
      <div className="pointer-events-none flex min-w-0 flex-col justify-center">
        <h1 className="sr-h-display truncate font-display text-2xl font-semibold tracking-tight text-fg">
          {title}
        </h1>
      </div>

      {/* Action controls on right: Search pill, Theme toggle, Notifications */}
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenCommand}
          aria-label="Open command palette (⌘K)"
          className="sr-search flex h-11 w-[320px] max-w-full cursor-pointer items-center gap-3 rounded-full p-1 pr-3.5 shadow-edge glass transition-all duration-150 hover:bg-glass-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
            aria-hidden="true"
          >
            <Search className="size-4" />
          </span>
          <span className="flex-1 truncate text-left text-sm text-muted-foreground">
            Search or jump to module...
          </span>
          <kbd className="sr-kbd shrink-0 rounded border border-border bg-muted px-2 py-1 font-mono text-[11px] leading-none text-muted-foreground select-none">
            ⌘K
          </kbd>
        </button>

        <ThemeToggle />

        <NotificationsMenu />
      </div>
    </header>
  );
};
