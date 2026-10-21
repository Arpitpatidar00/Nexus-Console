import { DEFAULT_MODULES, type ModuleId } from '@/shared/modules';

/** One-click starting points. Derived strictly from non-opt-in modules (DEFAULT_MODULES). */
export const PRESETS: { label: string; modules: ModuleId[] }[] = [
  { label: 'Everything', modules: [...DEFAULT_MODULES] },
  { label: 'Homebrew only', modules: ['homebrew'] },
  { label: 'Claude Chats only', modules: ['claude'] },
];

/** Opt-in modules worth suggesting when their tool is installed (PLAN F.3). */
const TOOL_MODULES: Record<string, ModuleId[]> = {
  docker: ['docker'],
  aws: ['cloud'],
  xcode: ['devices', 'releases'],
  android: ['devices'],
  flutter: ['devices', 'releases'],
  databases: ['databases'],
};

/** The defaults plus every opt-in module whose tool this Mac has. */
export function suggestModules(installed: string[]): ModuleId[] {
  const extra = installed.flatMap((id) => TOOL_MODULES[id] ?? []);
  return [...new Set([...DEFAULT_MODULES, ...extra])];
}
