import { useAppDispatch, useAppSelector } from '@/shared/state/hooks';
import { setActiveTab, type Tab } from '@/shared/state/uiSlice';
import { useModuleEnabled, useVisibleNav } from '@/shared/modules';
import { Mark } from '@/shared/ui/Logo';
import { Tooltip } from '@/shared/ui/Tooltip';
import { cn } from '@/shared/lib/cn';

export const NavRail = () => {
  const activeTab = useAppSelector((s) => s.ui.activeTab);
  const dispatch = useAppDispatch();
  const navItems = useVisibleNav();
  const homebrewOn = useModuleEnabled('homebrew');

  // Module items vs footer items (settings)
  const mainItems = navItems.filter((it) => it.tab !== 'settings');
  const footItems = navItems.filter((it) => it.tab === 'settings');

  const handleSelect = (tab: Tab) => {
    dispatch(setActiveTab(tab));
  };

  return (
    <nav
      aria-label="Main Navigation"
      className="sr-rail z-30 flex h-full w-16 shrink-0 flex-col items-center gap-5 rounded-2xl bg-sidebar/80 p-2.5 shadow-float glass select-none"
    >
      {/* Brand Mark at top */}
      <div className="flex items-center justify-center pt-2 pb-1">
        <button
          type="button"
          onClick={() => handleSelect('services')}
          aria-label="Stackroost Home"
          className="cursor-pointer rounded-full transition-transform duration-200 outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
        >
          <Mark size={32} />
        </button>
      </div>

      {/* Main navigation icons with tooltips */}
      <div className="sr-rail__items flex w-full flex-col items-center gap-2">
        {mainItems.map(({ tab, label, icon: Icon }) => {
          const isActive = tab === activeTab;
          return (
            <Tooltip key={tab} label={label} side="right">
              <button
                type="button"
                onClick={() => handleSelect(tab)}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'sr-rail__btn relative flex size-11 cursor-pointer items-center justify-center rounded-full text-sidebar-foreground transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'is-on bg-sidebar-primary text-sidebar-primary-foreground shadow-ring-ember'
                    : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
              >
                <Icon className="size-5 shrink-0" />
                {tab === 'services' && homebrewOn && (
                  <span className="sr-rail__badge absolute top-2 right-2 size-2 rounded-full bg-ember" />
                )}
              </button>
            </Tooltip>
          );
        })}
      </div>

      {/* Footer navigation (Settings) */}
      {footItems.length > 0 && (
        <div className="sr-rail__foot mt-auto flex w-full flex-col items-center gap-2 border-t border-hairline pt-2">
          {footItems.map(({ tab, label, icon: Icon }) => {
            const isActive = tab === activeTab;
            return (
              <Tooltip key={tab} label={label} side="right">
                <button
                  type="button"
                  onClick={() => handleSelect(tab)}
                  aria-label={label}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'sr-rail__btn relative flex size-11 cursor-pointer items-center justify-center rounded-full text-sidebar-foreground transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive
                      ? 'is-on bg-sidebar-primary text-sidebar-primary-foreground shadow-ring-ember'
                      : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  )}
                >
                  <Icon className="size-5 shrink-0" />
                </button>
              </Tooltip>
            );
          })}
        </div>
      )}
    </nav>
  );
};
