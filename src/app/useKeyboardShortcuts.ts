import { useEffect, useEffectEvent } from 'react';
import { hubOfTab, useVisibleHubs } from '@/shared/modules';
import { useAppSelector } from '@/shared/state/hooks';
import { useAppDispatch } from '@/shared/state/hooks';
import type { Tab } from '@/shared/state/uiSlice';
import { setActiveTab } from '@/shared/state/uiSlice';

/** Global macOS-style shortcuts: Cmd+1..7 switch rail items (Home, then each
 * visible hub — returning to its last page), Cmd+Shift+[ / ] step through the
 * active hub's tabs, Cmd+,
 * opens Settings (the standard "Preferences" shortcut), Cmd+F focuses the active
 * tab's search/filter input, if it has one (marked `data-nx-page-search`;
 * Sessions/Settings have none, so Cmd+F is a no-op there).
 *
 * The numbers are derived from the VISIBLE hubs, so a disabled module never
 * leaves a dead key and the run is always contiguous. */
export function useKeyboardShortcuts(): void {
  const dispatch = useAppDispatch();
  const hubs = useVisibleHubs();
  const activeTab = useAppSelector((s) => s.ui.activeTab);
  const lastTabByHub = useAppSelector((s) => s.ui.lastTabByHub);
  // Rail order: Home, then each hub's remembered (or first) page.
  const railTabs: Tab[] = [
    'home',
    ...hubs.map((h) => h.tabs.find((t) => t.tab === lastTabByHub[h.id])?.tab ?? h.tabs[0].tab),
  ];
  const hubTabs = hubs.find((h) => h.id === hubOfTab(activeTab))?.tabs.map((t) => t.tab) ?? [];
  // An Effect Event sees the latest tabs while the listener is registered once,
  // not re-subscribed on every render (these are fresh arrays each time).
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (!e.metaKey || e.altKey || e.ctrlKey) return;

    const tabs = railTabs;
    const nth = Number(e.key);
    if (Number.isInteger(nth) && nth >= 1 && nth <= tabs.length) {
      e.preventDefault();
      dispatch(setActiveTab(tabs[nth - 1]));
      return;
    }
    if (e.shiftKey && (e.key === '[' || e.key === ']' || e.key === '{' || e.key === '}')) {
      const inHub = hubTabs;
      const current = activeTab;
      const i = inHub.indexOf(current);
      if (i < 0 || inHub.length < 2) return;
      e.preventDefault();
      const step = e.key === '[' || e.key === '{' ? -1 : 1;
      dispatch(setActiveTab(inHub[(i + step + inHub.length) % inHub.length]));
      return;
    }
    if (e.key === ',') {
      e.preventDefault();
      dispatch(setActiveTab('settings'));
      return;
    }
    if (e.key.toLowerCase() === 'f') {
      const input = document.querySelector<HTMLInputElement>('[data-nx-page-search]');
      if (!input) return;
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}
