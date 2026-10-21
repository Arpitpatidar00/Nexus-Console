import { useMemo } from 'react';
import { useAppSelector } from '@/shared/state/hooks';
import { STATIC_ACTIONS } from './staticActions';
import { useDynamicActions } from './useDynamicActions';
import type { ActionItem } from './types';

export function useActions(): ActionItem[] {
  const dynamicActions = useDynamicActions();
  const state = useAppSelector((s) => s);

  return useMemo(() => {
    const all = [...STATIC_ACTIONS, ...dynamicActions];
    return all.filter((item) => (item.when ? item.when(state) : true));
  }, [dynamicActions, state]);
}
