import { describe, it, expect } from 'vitest';
import { dbConnectionSchema, type DbConnection, type DbGroup } from '../api/databases.schema';
import { mockConnections, mockGroups } from './databaseMocks';

describe('Phase 1 — Group-Based Workspace & Connection Management', () => {
  it('loads and validates multi-service group fixture with mixed engines', () => {
    expect(mockGroups).toHaveLength(1);
    const fameoGroup = mockGroups[0];
    expect(fameoGroup.id).toBe('grp_fameo');
    expect(fameoGroup.name).toBe('Fameo Cluster');

    const groupConns = mockConnections.filter((c) => c.groupId === fameoGroup.id);
    expect(groupConns).toHaveLength(5);

    const drivers = groupConns.map((c) => c.driver);
    expect(drivers).toContain('postgres');
    expect(drivers).toContain('mongodb');
    expect(drivers).toContain('mysql');
    expect(drivers).toContain('redis');
  });

  it('segregates grouped and ungrouped connections accurately', () => {
    const mixedConns: DbConnection[] = [
      ...mockConnections,
      {
        id: 'conn_standalone_pg',
        name: 'Standalone DB',
        driver: 'postgres',
        host: '127.0.0.1',
        port: 5439,
        user: 'postgres',
        database: 'standalone',
        tunnelId: null,
        allowWrites: false,
        env: 'dev',
        dataDir: null,
        groupId: null,
      },
    ];

    const grouped = mixedConns.filter((c) => c.groupId === 'grp_fameo');
    const ungrouped = mixedConns.filter((c) => !c.groupId);

    expect(grouped).toHaveLength(5);
    expect(ungrouped).toHaveLength(1);
    expect(ungrouped[0].id).toBe('conn_standalone_pg');
  });

  it('supports moving connection between groups and to ungrouped', () => {
    const conn = { ...mockConnections[0] };
    expect(conn.groupId).toBe('grp_fameo');

    // Move to second group
    const secondGroup: DbGroup = {
      id: 'grp_analytics',
      name: 'Analytics Services',
      description: 'OLAP pipelines',
      color: '#10b981',
      createdAt: 1729472100,
      updatedAt: 1729472100,
    };
    const movedToAnalytics = { ...conn, groupId: secondGroup.id };
    expect(movedToAnalytics.groupId).toBe('grp_analytics');

    // Move to ungrouped
    const movedToUngrouped = { ...conn, groupId: null };
    expect(movedToUngrouped.groupId).toBeNull();
  });

  it('simulates safe group delete policy: move member connections to ungrouped', () => {
    const targetGroupId = 'grp_fameo';
    const storeConnections = [...mockConnections];

    // Policy: deleteConnections = false -> retain all connections, set groupId = null
    const afterDelete = storeConnections.map((c) =>
      c.groupId === targetGroupId ? { ...c, groupId: null } : c,
    );

    expect(afterDelete).toHaveLength(5);
    expect(afterDelete.every((c) => c.groupId === null)).toBe(true);
    expect(afterDelete.find((c) => c.id === 'conn_pg_main')?.name).toBe('Main Database');
  });

  it('simulates destructive group delete policy: cascade remove member connections', () => {
    const targetGroupId = 'grp_fameo';
    const storeConnections: DbConnection[] = [
      ...mockConnections,
      {
        id: 'conn_other_system',
        name: 'Other System DB',
        driver: 'postgres',
        host: '127.0.0.1',
        port: 5440,
        user: 'postgres',
        database: 'other',
        tunnelId: null,
        allowWrites: false,
        env: 'dev',
        dataDir: null,
        groupId: 'grp_other',
      },
    ];

    // Policy: deleteConnections = true -> drop member connections, keep unrelated
    const retained = storeConnections.filter((c) => c.groupId !== targetGroupId);
    expect(retained).toHaveLength(1);
    expect(retained[0].id).toBe('conn_other_system');
  });

  it('preserves connection identity, endpoint, and prod read-only rule upon editing', () => {
    const original = mockConnections[0];
    const edited: DbConnection = {
      ...original,
      name: 'Renamed Main Postgres',
      host: '10.0.0.5',
      port: 5432,
      env: 'prod',
      allowWrites: true, // Should be forced to false if env === 'prod'
    };

    const isProd = edited.env === 'prod' || edited.env === 'production';
    const effectiveAllowWrites = edited.allowWrites && !isProd;

    const validated = dbConnectionSchema.parse({
      ...edited,
      allowWrites: effectiveAllowWrites,
    });

    expect(validated.id).toBe(original.id); // Same ID -> Keychain preserved
    expect(validated.name).toBe('Renamed Main Postgres');
    expect(validated.host).toBe('10.0.0.5');
    expect(validated.allowWrites).toBe(false); // Prod read-only rule enforced
  });

  it('loads legacy store connection without groupId as Ungrouped (groupId: null)', () => {
    const legacyJson = {
      id: 'db_legacy_1',
      name: 'Legacy MySQL',
      driver: 'mysql',
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      database: 'legacy_app',
      tunnelId: null,
      allowWrites: false,
      env: 'dev',
      dataDir: null,
    };

    const parsed = dbConnectionSchema.parse(legacyJson);
    expect(parsed.id).toBe('db_legacy_1');
    expect(parsed.groupId).toBeNull();
  });
});
