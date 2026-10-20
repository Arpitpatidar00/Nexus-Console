import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/shared/state/hooks';
import { setActiveTab, type Tab } from '@/shared/state/uiSlice';
import { useVisibleNav } from '@/shared/modules';
import { CommandDial } from '@/shared/ui/CommandDial';
import { ListRow } from '@/shared/ui/ListRow';
import { SearchField } from '@/shared/ui/SearchField';
import { useActions, scoreAction, type ActionItem, type ActionGroup } from '@/shared/actions';
import { cn } from '@/shared/lib/cn';
import {
  X,
  RotateCw,
  Server,
  Network,
  Terminal,
  Shield,
  Sparkles,
  Settings,
  ArrowRight,
  AlertTriangle,
  History,
} from 'lucide-react';

const RECENT_KEY = 'stackroost:recent-actions';
const MAX_RECENT = 5;

function loadRecentIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecentId(id: string) {
  try {
    const prev = loadRecentIds().filter((item) => item !== id);
    const next = [id, ...prev].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage failures
  }
}

function getGroupIcon(group: ActionGroup | 'recent') {
  switch (group) {
    case 'recent':
      return <History className="size-4" />;
    case 'navigation':
      return <ArrowRight className="size-4" />;
    case 'services':
      return <RotateCw className="size-4" />;
    case 'ports':
      return <Network className="size-4" />;
    case 'remote':
      return <Server className="size-4" />;
    case 'terminal':
      return <Terminal className="size-4" />;
    case 'doctor':
      return <Shield className="size-4" />;
    case 'maclean':
      return <Sparkles className="size-4" />;
    case 'settings':
    default:
      return <Settings className="size-4" />;
  }
}

const GROUP_LABELS: Record<string, string> = {
  recent: 'Recent Actions',
  navigation: 'Navigation',
  services: 'Services',
  ports: 'Listening Ports',
  remote: 'Remote Servers',
  terminal: 'Terminal & Shell',
  doctor: 'Doctor Diagnostics',
  maclean: 'Mac Clean',
  settings: 'Settings & Appearance',
};

interface CommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CommandDialog: React.FC<CommandDialogProps> = ({ open, onOpenChange }) => {
  const dispatch = useAppDispatch();
  const activeTab = useAppSelector((s) => s.ui.activeTab);
  const navItems = useVisibleNav();
  const actions = useActions();

  const [query, setQuery] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>(activeTab);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setSelectedModule(activeTab);
      setQuery('');
      setSelectedIndex(0);
      setRecentIds(loadRecentIds());
    }
  }, [open, activeTab]);

  const handleSelectTab = useCallback(
    (tab: string) => {
      dispatch(setActiveTab(tab as Tab));
      onOpenChange(false);
    },
    [dispatch, onOpenChange],
  );

  const dialItems = useMemo(() => {
    return navItems.map((item) => ({
      id: item.tab,
      label: item.label,
      icon: item.icon,
    }));
  }, [navItems]);

  // Filter & rank actions
  const { selectableItems, groupedItems } = useMemo(() => {
    const q = query.trim();
    if (q) {
      const scored = actions
        .map((action) => ({ action, score: scoreAction(action, q) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.action);

      // Group scored results by their group for clean display
      const groups = new Map<string, ActionItem[]>();
      for (const item of scored) {
        const list = groups.get(item.group) ?? [];
        list.push(item);
        groups.set(item.group, list);
      }

      return {
        selectableItems: scored,
        groupedItems: Array.from(groups.entries()).map(([group, items]) => ({
          group,
          items,
        })),
      };
    }

    // When query is empty: show recent actions first, then grouped catalog
    const recentActions: ActionItem[] = [];
    const remainingActions: ActionItem[] = [];

    const actionsById = new Map<string, ActionItem>();
    for (const a of actions) {
      actionsById.set(a.id, a);
    }

    for (const rid of recentIds) {
      const found = actionsById.get(rid);
      if (found) {
        recentActions.push(found);
      }
    }

    const recentSet = new Set(recentActions.map((a) => a.id));
    for (const a of actions) {
      if (!recentSet.has(a.id)) {
        remainingActions.push(a);
      }
    }

    const grouped: { group: string; items: ActionItem[] }[] = [];
    if (recentActions.length > 0) {
      grouped.push({ group: 'recent', items: recentActions });
    }

    const groups = new Map<string, ActionItem[]>();
    for (const item of remainingActions) {
      const list = groups.get(item.group) ?? [];
      list.push(item);
      groups.set(item.group, list);
    }

    for (const [group, items] of groups.entries()) {
      grouped.push({ group, items });
    }

    const flat = [...recentActions, ...remainingActions];
    return {
      selectableItems: flat,
      groupedItems: grouped,
    };
  }, [query, actions, recentIds]);

  // Keep selectedIndex in bounds
  useEffect(() => {
    setSelectedIndex((prev) => {
      if (selectableItems.length === 0) return 0;
      return Math.min(prev, selectableItems.length - 1);
    });
  }, [selectableItems.length]);

  const handleExecute = useCallback(
    (action: ActionItem) => {
      saveRecentId(action.id);
      try {
        action.run({
          dispatch,
          navigate: (tab) => dispatch(setActiveTab(tab)),
        });
      } finally {
        onOpenChange(false);
      }
    },
    [dispatch, onOpenChange],
  );

  // Global & modal keydown handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
        return;
      }

      if (!open) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          selectableItems.length > 0 ? (prev + 1) % selectableItems.length : 0,
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          selectableItems.length > 0
            ? (prev - 1 + selectableItems.length) % selectableItems.length
            : 0,
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectableItems[selectedIndex]) {
          handleExecute(selectableItems[selectedIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange, selectableItems, selectedIndex, handleExecute]);

  if (!open) return null;

  let flatCounter = 0;

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
        aria-label="Command palette"
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
            placeholder="Search actions, services, ports, hosts... (Cmd+K)"
            shortcut="esc"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            autoFocus
          />

          <div
            ref={listRef}
            tabIndex={-1}
            role="listbox"
            aria-label="Command suggestions"
            className="flex max-h-[360px] flex-col gap-2 overflow-y-auto pr-1 outline-none"
          >
            {selectableItems.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No matching actions for &quot;{query}&quot;
              </div>
            ) : (
              groupedItems.map((groupEntry) => {
                const groupLabel =
                  GROUP_LABELS[groupEntry.group] ||
                  groupEntry.group.charAt(0).toUpperCase() + groupEntry.group.slice(1);

                return (
                  <div key={groupEntry.group} className="flex flex-col gap-1.5">
                    <p className="sr-eyebrow mt-1 text-muted-foreground">{groupLabel}</p>
                    {groupEntry.items.map((item) => {
                      const itemIndex = flatCounter++;
                      const isSelected = itemIndex === selectedIndex;
                      const icon = item.danger ? (
                        <AlertTriangle className="size-4 text-destructive" />
                      ) : (
                        getGroupIcon(groupEntry.group === 'recent' ? 'recent' : item.group)
                      );

                      return (
                        <div
                          key={item.id}
                          ref={(el) => {
                            if (isSelected) {
                              el?.scrollIntoView({ block: 'nearest' });
                            }
                          }}
                        >
                          <ListRow
                            active={isSelected}
                            icon={icon}
                            title={
                              <span
                                className={item.danger ? 'font-medium text-destructive' : undefined}
                              >
                                {item.title}
                              </span>
                            }
                            subtitle={item.subtitle}
                            onClick={() => handleExecute(item)}
                            className={cn(
                              'cursor-pointer',
                              item.danger && 'hover:border-destructive/40',
                            )}
                            trailing={
                              <div className="flex items-center gap-1.5">
                                {item.danger && (
                                  <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-destructive uppercase">
                                    Danger
                                  </span>
                                )}
                                {item.shortcut && (
                                  <kbd className="sr-kbd rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                                    {item.shortcut}
                                  </kbd>
                                )}
                                {isSelected && (
                                  <kbd className="sr-kbd rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                                    ↵
                                  </kbd>
                                )}
                              </div>
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-4 border-t border-hairline pt-2 text-xs text-muted-foreground">
            <span>
              <span className="sr-kbd mr-1">↑↓</span> move
            </span>
            <span>
              <span className="sr-kbd mr-1">↵</span> run
            </span>
            <span>
              <span className="sr-kbd mr-1">esc</span> close
            </span>
          </div>
        </div>
      </dialog>
    </div>
  );
};
