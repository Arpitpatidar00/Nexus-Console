import type { AppDispatch } from '@/shared/state/hooks';
import type { RootState } from '@/shared/state/rootReducer';
import type { Tab } from '@/shared/state/uiSlice';

export type ActionGroup =
  'navigation' | 'services' | 'ports' | 'remote' | 'maclean' | 'doctor' | 'terminal' | 'settings';

export interface ActionContext {
  dispatch: AppDispatch;
  navigate: (tab: Tab) => void;
}

export interface ActionItem {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
  group: ActionGroup;
  shortcut?: string;
  danger?: boolean;
  when?: (state: RootState) => boolean;
  run: (ctx: ActionContext) => void | Promise<void>;
}
