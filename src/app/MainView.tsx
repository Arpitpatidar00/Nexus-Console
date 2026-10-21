import { Suspense, useEffect } from 'react';
import { hubOfTab, useVisibleTabs } from '@/shared/modules';
import { HubTabs } from '@/shared/layout/HubTabs';
import { useAppDispatch, useAppSelector } from '@/shared/state/hooks';
import { rememberHubTab, setActiveTab } from '@/shared/state/uiSlice';
import { Spinner } from '@/shared/ui/Spinner';
import { PAGES } from './MainView.config';

export const MainView = () => {
  const activeTab = useAppSelector((s) => s.ui.activeTab);
  const dispatch = useAppDispatch();
  const visibleTabs = useVisibleTabs();
  // A module can be switched off while its own tab is open. Settings is always
  // visible, so visibleTabs[0] always exists.
  const tab = visibleTabs.includes(activeTab) ? activeTab : visibleTabs[0];

  // Correct the store too, so the sidebar highlight follows the fallback.
  useEffect(() => {
    if (tab !== activeTab) dispatch(setActiveTab(tab));
  }, [tab, activeTab, dispatch]);

  useEffect(() => {
    const hub = hubOfTab(tab);
    if (hub) dispatch(rememberHubTab({ hub, tab }));
  }, [tab, dispatch]);

  const Page = PAGES[tab];

  return (
    <>
      <HubTabs />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          }
        >
          <Page />
        </Suspense>
      </div>
    </>
  );
};
