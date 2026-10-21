import { House, Settings } from 'lucide-react';
import type { Tab } from '@/shared/state/uiSlice';
import {
  MODULES,
  MODULE_GROUPS,
  MODULE_IDS,
  type ModuleDef,
  type ModuleGroup,
  type ModuleId,
  type NavEntry,
} from './modules.config';

export const ALL_MODULES: ModuleId[] = [...MODULE_IDS];

/** "Everything on" for defaults and fallbacks: every module except opt-in ones
 * (Servers reads ~/.ssh and reaches other machines, so it's never on unasked). */
export const DEFAULT_MODULES: ModuleId[] = MODULES.filter((m) => !m.optIn).map((m) => m.id);

/** Belongs to no module on purpose — Settings stays reachable however the rest
 * is configured, so a bad choice is always recoverable from inside the app. */
const SETTINGS_NAV: NavEntry = { tab: 'settings', label: 'Settings', icon: Settings };

/** Home belongs to no module either: it summarises whichever ones are on. */
export const HOME_NAV: NavEntry = { tab: 'home', label: 'Home', icon: House };

/** Every reachable page for the enabled modules: Home, module pages in hub
 * order (registry order inside a hub), Settings last. */
export function visibleNav(enabled: ModuleId[]): NavEntry[] {
  const owned = visibleHubs(enabled).flatMap((h) => h.tabs);
  return [HOME_NAV, ...owned, SETTINGS_NAV];
}

export interface VisibleHub {
  id: ModuleGroup;
  label: string;
  icon: (typeof MODULE_GROUPS)[number]['icon'];
  tabs: NavEntry[];
}

/** Hubs with at least one enabled module, in hub order — the rail (PLAN F.1). */
export function visibleHubs(enabled: ModuleId[]): VisibleHub[] {
  return MODULE_GROUPS.map((g) => ({
    ...g,
    tabs: MODULES.filter((m) => m.group === g.id && enabled.includes(m.id)).flatMap((m) => m.nav),
  })).filter((h) => h.tabs.length > 0);
}

/** The hub a page lives in; Home and Settings live in none. */
export function hubOfTab(tab: Tab): ModuleGroup | null {
  return MODULES.find((m) => m.nav.some((n) => n.tab === tab))?.group ?? null;
}

/** The module that owns a page, for its privacy line. */
export function moduleOfTab(tab: Tab): ModuleDef | null {
  return MODULES.find((m) => m.nav.some((n) => n.tab === tab)) ?? null;
}

export function visibleTabs(enabled: ModuleId[]): Tab[] {
  return visibleNav(enabled).map((n) => n.tab);
}

export function isTabVisible(tab: Tab, enabled: ModuleId[]): boolean {
  return visibleTabs(enabled).includes(tab);
}

/** Does this Mac have what the module needs? See ModuleRequirement for why only
 * Claude Code counts. */
export function isModuleAvailable(id: ModuleId, deps: { claudeInstalled: boolean }): boolean {
  return MODULES.find((m) => m.id === id)?.requires === 'claude' ? deps.claudeInstalled : true;
}

/** Enabled AND available — what the sidebar and the router go by. */
export function availableModules(
  enabled: ModuleId[],
  deps: { claudeInstalled: boolean },
): ModuleId[] {
  return enabled.filter((id) => isModuleAvailable(id, deps));
}

/** Normalize the module list read off disk. `settings.json` is user-editable, so
 * this is a trust boundary — and the one place in the app that fails OPEN:
 * failing closed here would render a window with no tabs, which no user could
 * recover from. Unknown ids are dropped (a renamed module can never brick the
 * app) and the result is put back in registry order.
 *
 * `hasPersistedSettings` distinguishes "never chosen" (→ null, show the first-run
 * screen) from "existing install, key not written yet" (→ everything on, no
 * onboarding wall for someone mid-flow). */
export function sanitizeModules(raw: unknown, hasPersistedSettings: boolean): ModuleId[] | null {
  if (!Array.isArray(raw)) return hasPersistedSettings ? [...DEFAULT_MODULES] : null;
  const known = MODULE_IDS.filter((id) => raw.includes(id));
  return known.length > 0 ? known : [...DEFAULT_MODULES];
}
