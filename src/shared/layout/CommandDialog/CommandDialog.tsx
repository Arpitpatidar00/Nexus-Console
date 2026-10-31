import React, { useState, useEffect, useMemo, useRef, useCallback, useEffectEvent } from 'react';
import { useAppDispatch, useAppSelector } from '@/shared/state/hooks';
import { setActiveTab, type Tab } from '@/shared/state/uiSlice';
import { addRecentCommandId, togglePinnedCommand } from '@/shared/state/settingsSlice';
import { useVisibleNav } from '@/shared/modules';
import { CommandDial } from '@/shared/ui/CommandDial';
import { ListRow } from '@/shared/ui/ListRow';
import { SearchField } from '@/shared/ui/SearchField';
import {
  useActions,
  scoreAction,
  paletteSections,
  type ActionItem,
  type SectionId,
} from '@/shared/actions';
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
  Pin,
  PinOff,
  Repeat,
} from 'lucide-react';

function getGroupIcon(group: SectionId) {
  switch (group) {
    case 'repeat':
      return <Repeat className="size-4" />;
    case 'pinned':
      return <Pin className="size-4" />;
    case 'recentHosts':
      return <Server className="size-4" />;
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
  repeat: 'Repeat last',
  pinned: 'Pinned',
  recentHosts: 'Recent hosts',
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
  const recentIds = useAppSelector((s) => s.settings.recentCommandIds);
  const pinnedIds = useAppSelector((s) => s.settings.pinnedCommandIds);
  const listRef = useRef<HTMLDivElement>(null);
  // Only keyboard moves scroll the list; hover-selection must not make it jump.
  const keyboardMove = useRef(false);

  // Fresh palette on every open (and when the tab changes while open) — during
  // render, not in an effect's second pass.
  const [syncedFor, setSyncedFor] = useState({ open: false, activeTab });
  if (syncedFor.open !== open || syncedFor.activeTab !== activeTab) {
    setSyncedFor({ open, activeTab });
    if (open) {
      setSelectedModule(activeTab);
      setQuery('');
      setSelectedIndex(0);
    }
  }

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

  // Filter & rank, then group. The selectable order is derived FROM the grouped
  // display order — ranking flat and grouping separately made ↑↓ highlight one
  // row while ↵ ran another.
  const { selectableItems, groupedItems } = useMemo(() => {
    const q = query.trim();
    let sections: { group: string; items: ActionItem[] }[];
    if (q) {
      const scored = actions
        .map((action) => ({ action, score: scoreAction(action, q) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.action);
      // Groups appear in the order of their best match.
      const groups = new Map<string, ActionItem[]>();
      for (const item of scored) {
        const list = groups.get(item.group) ?? [];
        list.push(item);
        groups.set(item.group, list);
      }
      sections = Array.from(groups.entries()).map(([group, items]) => ({ group, items }));
    } else {
      // Empty query: repeat last, pinned, recent hosts, recents, then the catalog.
      sections = paletteSections(actions, { pinnedIds, recentIds }).sections;
    }
    let index = 0;
    const indexed = sections.map(({ group, items }) => ({
      group,
      items: items.map((item) => ({ item, index: index++ })),
    }));
    return {
      selectableItems: indexed.flatMap((g) => g.items.map((e) => e.item)),
      groupedItems: indexed,
    };
  }, [query, actions, recentIds, pinnedIds]);

  // Kept in bounds by derivation when the list shrinks.
  const activeIndex =
    selectableItems.length === 0 ? 0 : Math.min(selectedIndex, selectableItems.length - 1);

  // React Compiler memoizes this; no hand-written useCallback.
  const handleExecute = (action: ActionItem) => {
    dispatch(addRecentCommandId(action.id));
    try {
      action.run({
        dispatch,
        navigate: (tab) => dispatch(setActiveTab(tab)),
      });
    } finally {
      onOpenChange(false);
    }
  };

  // Global & modal keydown handling
  // An Effect Event: always the latest state, while the listener is added once.
  const handleKeyDown = useEffectEvent((e: KeyboardEvent) => {
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
      keyboardMove.current = true;
      setSelectedIndex(selectableItems.length > 0 ? (activeIndex + 1) % selectableItems.length : 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      keyboardMove.current = true;
      setSelectedIndex(
        selectableItems.length > 0
          ? (activeIndex - 1 + selectableItems.length) % selectableItems.length
          : 0,
      );
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      const item = selectableItems[activeIndex];
      if (item) dispatch(togglePinnedCommand(item.id));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectableItems[activeIndex]) {
        handleExecute(selectableItems[activeIndex]);
      }
    }
  });

  useEffect(() => {
    const listener = (e: KeyboardEvent) => handleKeyDown(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4">
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
          className="absolute top-4 right-4 flex size-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-fg"
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
                    {groupEntry.items.map(({ item, index: itemIndex }) => {
                      const isSelected = itemIndex === activeIndex;
                      const icon = item.danger ? (
                        <AlertTriangle className="size-4 text-destructive" />
                      ) : (
                        getGroupIcon(
                          ['repeat', 'pinned', 'recentHosts', 'recent'].includes(groupEntry.group)
                            ? (groupEntry.group as SectionId)
                            : item.group,
                        )
                      );

                      return (
                        <div
                          key={`${groupEntry.group}:${item.id}`}
                          onPointerMove={() => {
                            if (!isSelected) setSelectedIndex(itemIndex);
                          }}
                          ref={(el) => {
                            if (isSelected && el && keyboardMove.current) {
                              keyboardMove.current = false;
                              el.scrollIntoView({ block: 'nearest' });
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
                              'group cursor-pointer',
                              item.danger && 'hover:border-destructive/40',
                            )}
                            trailing={
                              <div className="flex items-center gap-1.5">
                                {item.danger && (
                                  <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-destructive uppercase">
                                    Danger
                                  </span>
                                )}
                                <button
                                  type="button"
                                  aria-label={pinnedIds.includes(item.id) ? 'Unpin' : 'Pin'}
                                  title={pinnedIds.includes(item.id) ? 'Unpin (⌘P)' : 'Pin (⌘P)'}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    dispatch(togglePinnedCommand(item.id));
                                  }}
                                  className={cn(
                                    'rounded p-1 text-muted-foreground hover:bg-muted hover:text-fg',
                                    !isSelected &&
                                      !pinnedIds.includes(item.id) &&
                                      'opacity-0 group-hover:opacity-100',
                                  )}
                                >
                                  {pinnedIds.includes(item.id) ? (
                                    <PinOff className="size-3.5" />
                                  ) : (
                                    <Pin className="size-3.5" />
                                  )}
                                </button>
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
              <span className="sr-kbd mr-1">⌘P</span> pin
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
