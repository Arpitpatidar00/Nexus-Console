import { Eye, Globe, PencilLine } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/shared/state/hooks';
import { setActiveTab } from '@/shared/state/uiSlice';
import { hubOfTab, moduleOfTab, useVisibleHubs } from '@/shared/modules';
import { cn } from '@/shared/lib/cn';

/** Pages of the active hub as tabs (PLAN F.1) and the owning module's
 * reads / changes / network line (PLAN F.4). Nothing for Home and Settings. */
export const HubTabs = () => {
  const activeTab = useAppSelector((s) => s.ui.activeTab);
  const dispatch = useAppDispatch();
  const hub = useVisibleHubs().find((h) => h.id === hubOfTab(activeTab));
  const privacy = moduleOfTab(activeTab)?.privacy;
  if (!hub || !privacy) return null;

  return (
    <div className="flex shrink-0 flex-col gap-2 pb-3">
      {hub.tabs.length > 1 && (
        <div role="tablist" aria-label={hub.label} className="flex flex-wrap items-center gap-1">
          {hub.tabs.map(({ tab, label, icon: Icon }) => {
            const active = tab === activeTab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => dispatch(setActiveTab(tab))}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  active
                    ? 'bg-ember-soft text-ember-text'
                    : 'text-fg-muted hover:bg-list hover:text-fg',
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            );
          })}
        </div>
      )}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-fg-subtle">
        <span className="flex items-center gap-1">
          <Eye className="size-3" aria-hidden /> <span className="sr-only">Reads:</span>
          {privacy.reads}
        </span>
        <span className="flex items-center gap-1">
          <PencilLine className="size-3" aria-hidden /> <span className="sr-only">Changes:</span>
          {privacy.changes}
        </span>
        <span className="flex items-center gap-1">
          <Globe className="size-3" aria-hidden /> <span className="sr-only">Network:</span>
          {privacy.network}
        </span>
      </p>
    </div>
  );
};
