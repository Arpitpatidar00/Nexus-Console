import { describe, expect, it } from 'vitest';
import {
  initialNavigationState,
  navigationReducer,
  reconcileNavigation,
  type NavigationState,
} from './navigation';

describe('navigationReducer', () => {
  it('opens group map', () => {
    const s1 = navigationReducer(initialNavigationState, {
      type: 'OPEN_MAP',
      groupId: 'group-1',
    });
    expect(s1.viewMode).toBe('map');
    expect(s1.groupId).toBe('group-1');
    expect(s1.trail).toEqual([]);
  });

  it('selects a connection', () => {
    const s1 = navigationReducer(initialNavigationState, {
      type: 'SELECT_CONNECTION',
      connectionId: 'conn-1',
      groupId: 'group-1',
    });
    expect(s1.viewMode).toBe('connection');
    expect(s1.connectionId).toBe('conn-1');
    expect(s1.groupId).toBe('group-1');
    expect(s1.trail).toEqual([]);
  });

  it('pushes table onto trail and switches to table view', () => {
    const s1: NavigationState = {
      groupId: 'group-1',
      connectionId: 'conn-1',
      viewMode: 'connection',
      trail: [],
    };

    const s2 = navigationReducer(s1, {
      type: 'OPEN_TABLE',
      connectionId: 'conn-1',
      tableKey: 'public.orders',
      tableName: 'orders',
    });

    expect(s2.viewMode).toBe('table');
    expect(s2.connectionId).toBe('conn-1');
    expect(s2.trail).toHaveLength(1);
    expect(s2.trail[0].tableKey).toBe('public.orders');
  });

  it('supports cross-database navigation across connections with back trail', () => {
    const s1: NavigationState = {
      groupId: 'group-1',
      connectionId: 'conn-1',
      viewMode: 'table',
      trail: [
        {
          connectionId: 'conn-1',
          tableKey: 'public.orders',
          tableName: 'orders',
          connectionName: 'Orders DB',
        },
      ],
    };

    // Jump from orders table (conn-1) to users table in auth DB (conn-2) with filter
    const s2 = navigationReducer(s1, {
      type: 'OPEN_TABLE',
      connectionId: 'conn-2',
      tableKey: 'public.users',
      tableName: 'users',
      connectionName: 'Auth DB',
      filter: { column: 'id', op: 'eq', value: '42' },
    });

    expect(s2.viewMode).toBe('table');
    expect(s2.connectionId).toBe('conn-2');
    expect(s2.trail).toHaveLength(2);
    expect(s2.trail[1].connectionId).toBe('conn-2');
    expect(s2.trail[1].filter).toEqual({ column: 'id', op: 'eq', value: '42' });

    // Press Back: should return to Orders DB (conn-1) and exact orders table
    const s3 = navigationReducer(s2, { type: 'BACK' });
    expect(s3.viewMode).toBe('table');
    expect(s3.connectionId).toBe('conn-1');
    expect(s3.trail).toHaveLength(1);
    expect(s3.trail[0].tableKey).toBe('public.orders');

    // Press Back again: returns to connection view
    const s4 = navigationReducer(s3, { type: 'BACK' });
    expect(s4.viewMode).toBe('connection');
    expect(s4.trail).toHaveLength(0);
  });

  it('supports breadcrumb jumping via GO_TO_CRUMB', () => {
    const s1: NavigationState = {
      groupId: 'group-1',
      connectionId: 'conn-3',
      viewMode: 'table',
      trail: [
        { connectionId: 'conn-1', tableKey: 'public.orders' },
        { connectionId: 'conn-2', tableKey: 'public.users' },
        { connectionId: 'conn-3', tableKey: 'public.profiles' },
      ],
    };

    const s2 = navigationReducer(s1, { type: 'GO_TO_CRUMB', index: 0 });
    expect(s2.trail).toHaveLength(1);
    expect(s2.connectionId).toBe('conn-1');
    expect(s2.trail[0].tableKey).toBe('public.orders');
  });

  it('clears trail to return to connection overview', () => {
    const s1: NavigationState = {
      groupId: 'group-1',
      connectionId: 'conn-1',
      viewMode: 'table',
      trail: [{ connectionId: 'conn-1', tableKey: 'public.orders' }],
    };

    const s2 = navigationReducer(s1, { type: 'CLEAR_TRAIL' });
    expect(s2.viewMode).toBe('connection');
    expect(s2.trail).toHaveLength(0);
  });

  it('reconciles safely when active connection is removed', () => {
    const s1: NavigationState = {
      groupId: 'group-1',
      connectionId: 'conn-deleted',
      viewMode: 'table',
      trail: [
        { connectionId: 'conn-valid', tableKey: 'public.orders' },
        { connectionId: 'conn-deleted', tableKey: 'public.users' },
      ],
    };

    const s2 = reconcileNavigation(s1, new Set(['conn-valid', 'conn-other']));
    expect(s2.trail).toHaveLength(1);
    expect(s2.connectionId).toBe('conn-valid');
    expect(s2.viewMode).toBe('table');
  });

  it('reconciles to available connection when all trail items are deleted', () => {
    const s1: NavigationState = {
      groupId: 'group-1',
      connectionId: 'conn-deleted',
      viewMode: 'table',
      trail: [{ connectionId: 'conn-deleted', tableKey: 'public.users' }],
    };

    const s2 = reconcileNavigation(s1, new Set(['conn-remaining']));
    expect(s2.trail).toHaveLength(0);
    expect(s2.connectionId).toBe('conn-remaining');
    expect(s2.viewMode).toBe('connection');
  });
});
