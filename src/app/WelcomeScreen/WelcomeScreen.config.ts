import { DEFAULT_MODULES, type ModuleId } from '@/shared/modules';

/** One-click starting points. Derived strictly from non-opt-in modules (DEFAULT_MODULES). */
export const PRESETS: { label: string; modules: ModuleId[] }[] = [
  { label: 'Everything', modules: [...DEFAULT_MODULES] },
  { label: 'Homebrew only', modules: ['homebrew'] },
  { label: 'Claude Chats only', modules: ['claude'] },
];
