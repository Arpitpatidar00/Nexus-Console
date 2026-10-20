import React, { useState, useEffect, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '@/shared/state/hooks';
import { setActiveTab, type Tab } from '@/shared/state/uiSlice';
import { useVisibleNav } from '@/shared/modules';
import { CommandDial } from '@/shared/ui/CommandDial';
import { ListRow } from '@/shared/ui/ListRow';
import { SearchField } from '@/shared/ui/SearchField';
import { EnvBadge } from '@/shared/ui/Badge';
import { Activity, Server, Network, Shield, X, RotateCw } from 'lucide-react';

interface CommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CommandDialog: React.FC<CommandDialogProps> = ({ open, onOpenChange }) => {
  const dispatch = useAppDispatch();
  const activeTab = useAppSelector((s) => s.ui.activeTab);
  const navItems = useVisibleNav();

  const [query, setQuery] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>(activeTab);

  useEffect(() => {
    if (open) {
      setSelectedModule(activeTab);
      setQuery('');
    }
  }, [open, activeTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  const dialItems = useMemo(() => {
    return navItems.map((item) => ({
      id: item.tab,
      label: item.label,
      icon: item.icon,
    }));
  }, [navItems]);

  const handleSelectTab = (tab: string) => {
    dispatch(setActiveTab(tab as Tab));
    onOpenChange(false);
  };

  const filteredItems = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();
    return dialItems.filter(
      (item) => item.label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q),
    );
  }, [query, dialItems]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close command dialog backdrop"
        tabIndex={-1}
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 animate-in cursor-default border-none bg-black/50 backdrop-blur-md duration-150 outline-none fade-in"
      />
      <dialog
        open
        aria-label="Command dial"
        className="sr-glass relative z-10 m-0 flex w-full max-w-[1040px] flex-wrap items-center gap-8 rounded-2xl border border-border bg-popover/90 p-8 text-popover-foreground shadow-float"
      >
        <button
          type="button"
          aria-label="Close command palette"
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 flex size-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-5" />
        </button>

        {/* Left column: the visual Command Dial */}
        <div className="flex min-w-[340px] flex-1 flex-col gap-4 overflow-x-auto">
          <p className="sr-eyebrow text-muted-foreground">Jump to module</p>
          <CommandDial
            items={dialItems}
            active={selectedModule}
            onSelect={(id) => {
              setSelectedModule(id);
              handleSelectTab(id);
            }}
            label="Module dial"
            showList={false}
          />
        </div>

        {/* Right column: Search + Action list */}
        <div className="flex min-w-[320px] flex-1 flex-col gap-3.5">
          <SearchField
            placeholder="Type a command or jump to module..."
            shortcut="esc"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />

          <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto pr-1">
            {query.trim() ? (
              filteredItems.length > 0 ? (
                <>
                  <p className="sr-eyebrow mt-1 text-muted-foreground">Matching Modules</p>
                  {filteredItems.map((item) => {
                    const IconComp = item.icon || Activity;
                    return (
                      <ListRow
                        key={item.id}
                        icon={<IconComp className="size-4" />}
                        title={`Open ${item.label}`}
                        subtitle={`Switch active screen to ${item.label}`}
                        onClick={() => handleSelectTab(item.id)}
                        className="cursor-pointer"
                        trailing={
                          <kbd className="sr-kbd rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                            ↵
                          </kbd>
                        }
                      />
                    );
                  })}
                </>
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No matching module or action for &quot;{query}&quot;
                </div>
              )
            ) : (
              <>
                <p className="sr-eyebrow mt-1 text-muted-foreground">Quick Actions</p>
                <ListRow
                  icon={<RotateCw className="size-4" />}
                  title="Check Services"
                  subtitle="Homebrew services status"
                  onClick={() => handleSelectTab('services')}
                  className="cursor-pointer"
                  trailing={
                    <kbd className="sr-kbd rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                      ↵
                    </kbd>
                  }
                />
                <ListRow
                  icon={<Server className="size-4" />}
                  title="Remote Servers"
                  subtitle="SSH hosts and containers"
                  onClick={() => handleSelectTab('servers')}
                  className="cursor-pointer"
                  trailing={<EnvBadge env="prod" />}
                />
                <ListRow
                  icon={<Shield className="size-4" />}
                  title="Run Doctor Scan"
                  subtitle="Read-only machine checks"
                  onClick={() => handleSelectTab('doctor')}
                  className="cursor-pointer"
                />
                <ListRow
                  icon={<Network className="size-4" />}
                  title="Inspect Listening Ports"
                  subtitle="Find stuck local ports"
                  onClick={() => handleSelectTab('ports')}
                  className="cursor-pointer"
                />
              </>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-4 border-t border-hairline pt-2 text-xs text-muted-foreground">
            <span>
              <span className="sr-kbd mr-1">↑↓</span> move
            </span>
            <span>
              <span className="sr-kbd mr-1">⌘K</span> toggle
            </span>
            <span>
              <span className="sr-kbd mr-1">↵</span> run
            </span>
          </div>
        </div>
      </dialog>
    </div>
  );
};
