export {
  MODULES,
  MODULE_IDS,
  MODULE_GROUPS,
  moduleById,
  type ModuleGroup,
  type ModuleDef,
  type ModulePrivacy,
  type ModuleId,
  type ModuleRequirement,
  type NavEntry,
} from './modules.config';
export {
  ALL_MODULES,
  DEFAULT_MODULES,
  HOME_NAV,
  availableModules,
  hubOfTab,
  moduleOfTab,
  visibleHubs,
  type VisibleHub,
  isModuleAvailable,
  isTabVisible,
  sanitizeModules,
  visibleNav,
  visibleTabs,
} from './selectors';
export {
  useEnabledModules,
  useModuleAvailable,
  useModuleEnabled,
  useVisibleHubs,
  useVisibleNav,
  useVisibleTabs,
} from './useEnabledModules';
export { useClaudeInstalled } from './useClaudeInstalled';
