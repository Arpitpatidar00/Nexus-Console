import { Settings, type LucideIcon } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/shared/state/hooks';
import { setActiveTab, type Tab } from '@/shared/state/uiSlice';
import { HOME_NAV, hubOfTab, useModuleEnabled, useVisibleHubs } from '@/shared/modules';
import { Mark } from '@/shared/ui/Logo';
import { Tooltip } from '@/shared/ui/Tooltip';
import { cn } from '@/shared/lib/cn';

const RailButton = ({
  label,
  icon: Icon,
  active,
  badge,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  badge?: boolean;
  onClick: () => void;
}) => (
  <Tooltip label={label} side="right">
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'sr-rail__btn relative flex size-11 cursor-pointer items-center justify-center rounded-full text-sidebar-foreground transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'is-on bg-sidebar-primary text-sidebar-primary-foreground shadow-ring-ember'
          : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
      )}
    >
      <Icon className="size-5 shrink-0" />
      {badge && (
        <span className="sr-rail__badge absolute top-2 right-2 size-2 rounded-full bg-ember" />
      )}
    </button>
  </Tooltip>
);

/** One icon per hub (PLAN F.1) — the pages inside a hub are tabs (`HubTabs`). */
export const NavRail = () => {
  const activeTab = useAppSelector((s) => s.ui.activeTab);
  const lastTabByHub = useAppSelector((s) => s.ui.lastTabByHub);
  const dispatch = useAppDispatch();
  const hubs = useVisibleHubs();
  const homebrewOn = useModuleEnabled('homebrew');
  const activeHub = hubOfTab(activeTab);

  const select = (tab: Tab) => dispatch(setActiveTab(tab));

  return (
    <nav
      aria-label="Main Navigation"
      className="sr-rail z-30 flex min-h-0 w-16 flex-1 shrink-0 flex-col items-center gap-5 rounded-2xl bg-sidebar/80 p-2.5 shadow-float glass select-none"
    >
      {/* Brand Mark at top */}
      <div className="flex items-center justify-center pt-2 pb-1">
        <button
          type="button"
          onClick={() => select('home')}
          aria-label="Stackroost Home"
          className="cursor-pointer rounded-full transition-transform duration-200 outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
        >
          <Mark size={32} />
        </button>
      </div>

      <div className="sr-rail__items flex w-full flex-col items-center gap-2">
        <RailButton
          label={HOME_NAV.label}
          icon={HOME_NAV.icon}
          active={activeTab === 'home'}
          onClick={() => select('home')}
        />
        <div className="my-1 h-px w-6 bg-border/60" aria-hidden="true" />
        {hubs.map((hub) => {
          const remembered = lastTabByHub[hub.id];
          const target = hub.tabs.find((t) => t.tab === remembered)?.tab ?? hub.tabs[0].tab;
          return (
            <RailButton
              key={hub.id}
              label={hub.label}
              icon={hub.icon}
              active={activeHub === hub.id}
              badge={hub.id === 'local' && homebrewOn}
              onClick={() => select(target)}
            />
          );
        })}
      </div>

      <div className="sr-rail__foot mt-auto flex w-full flex-col items-center gap-2 border-t border-hairline pt-2">
        <RailButton
          label="Settings"
          icon={Settings}
          active={activeTab === 'settings'}
          onClick={() => select('settings')}
        />
      </div>
    </nav>
  );
};
