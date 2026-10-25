import type { Filter } from '../api/explorer.schema';

export type ViewMode = 'map' | 'connection' | 'table';

export interface NavigationTrailItem {
  connectionId: string;
  tableKey: string;
  filter?: Filter;
  tableName?: string;
  connectionName?: string;
}

export interface NavigationState {
  groupId: string | null;
  connectionId: string | null;
  viewMode: ViewMode;
  trail: NavigationTrailItem[];
}

export type NavigationAction =
  | { type: 'OPEN_MAP'; groupId?: string | null }
  | { type: 'SELECT_CONNECTION'; connectionId: string; groupId?: string | null }
  | {
      type: 'OPEN_TABLE';
      connectionId: string;
      tableKey: string;
      filter?: Filter;
      tableName?: string;
      connectionName?: string;
      replace?: boolean;
    }
  | { type: 'BACK' }
  | { type: 'CLEAR_TRAIL' }
  | { type: 'GO_TO_CRUMB'; index: number }
  | { type: 'SET_GROUP'; groupId: string | null };

export const initialNavigationState: NavigationState = {
  groupId: null,
  connectionId: null,
  viewMode: 'connection',
  trail: [],
};

export function navigationReducer(
  state: NavigationState,
  action: NavigationAction,
): NavigationState {
  switch (action.type) {
    case 'OPEN_MAP':
      return {
        ...state,
        groupId: action.groupId !== undefined ? action.groupId : state.groupId,
        viewMode: 'map',
        trail: [],
      };

    case 'SELECT_CONNECTION':
      return {
        ...state,
        connectionId: action.connectionId,
        groupId: action.groupId !== undefined ? action.groupId : state.groupId,
        viewMode: 'connection',
        trail: [],
      };

    case 'OPEN_TABLE': {
      const newItem: NavigationTrailItem = {
        connectionId: action.connectionId,
        tableKey: action.tableKey,
        filter: action.filter,
        tableName: action.tableName,
        connectionName: action.connectionName,
      };

      const nextTrail = action.replace
        ? [...state.trail.slice(0, -1), newItem]
        : [...state.trail, newItem];

      return {
        ...state,
        connectionId: action.connectionId,
        viewMode: 'table',
        trail: nextTrail,
      };
    }

    case 'BACK': {
      if (state.trail.length <= 1) {
        return {
          ...state,
          viewMode: 'connection',
          trail: [],
        };
      }
      const nextTrail = state.trail.slice(0, -1);
      const top = nextTrail[nextTrail.length - 1];
      return {
        ...state,
        connectionId: top.connectionId,
        viewMode: 'table',
        trail: nextTrail,
      };
    }

    case 'CLEAR_TRAIL':
      return {
        ...state,
        viewMode: 'connection',
        trail: [],
      };

    case 'GO_TO_CRUMB': {
      if (action.index < 0 || action.index >= state.trail.length) {
        return state;
      }
      const nextTrail = state.trail.slice(0, action.index + 1);
      const top = nextTrail[nextTrail.length - 1];
      return {
        ...state,
        connectionId: top.connectionId,
        viewMode: 'table',
        trail: nextTrail,
      };
    }

    case 'SET_GROUP':
      return {
        ...state,
        groupId: action.groupId,
        trail: [],
      };

    default:
      return state;
  }
}

/**
 * Reconciles navigation state against available connections to prevent crashes
 * when a connection is removed while in table or connection view.
 */
export function reconcileNavigation(
  state: NavigationState,
  validConnectionIds: Set<string>,
): NavigationState {
  // Prune any trail items referencing deleted connections
  const validTrail = state.trail.filter((item) => validConnectionIds.has(item.connectionId));

  if (validTrail.length !== state.trail.length) {
    if (validTrail.length > 0) {
      const top = validTrail[validTrail.length - 1];
      return {
        ...state,
        connectionId: top.connectionId,
        viewMode: 'table',
        trail: validTrail,
      };
    }
    // Trail became empty
    const activeValid = state.connectionId && validConnectionIds.has(state.connectionId);
    return {
      ...state,
      connectionId: activeValid
        ? state.connectionId
        : (validConnectionIds.values().next().value ?? null),
      viewMode: state.viewMode === 'map' ? 'map' : 'connection',
      trail: [],
    };
  }

  // If connection is invalid and view mode is not map
  if (
    state.connectionId &&
    !validConnectionIds.has(state.connectionId) &&
    state.viewMode !== 'map'
  ) {
    return {
      ...state,
      connectionId: validConnectionIds.values().next().value ?? null,
      viewMode: 'connection',
      trail: [],
    };
  }

  return state;
}
