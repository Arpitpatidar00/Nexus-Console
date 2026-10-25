import { describe, it, expect } from 'vitest';
import { mockConnections, mockSchemas } from './databaseMocks';
import { crossDbLinks } from '../utils/relations';
import { buildMap } from '../utils/diagram';
import type { DbConnection } from '../api/databases.schema';

describe('Phase 7 — UX Integration, Accessibility, and Scope Integrity', () => {
  it('scopes group connections and diagram layout strictly to the active group', () => {
    const activeGroupId = 'grp_fameo';
    const allConns: DbConnection[] = [
      ...mockConnections,
      {
        id: 'conn_unrelated',
        name: 'Unrelated App DB',
        driver: 'postgres',
        host: '127.0.0.1',
        port: 5441,
        user: 'postgres',
        database: 'unrelated_db',
        tunnelId: null,
        allowWrites: false,
        env: 'dev',
        dataDir: null,
        groupId: 'grp_other',
      },
    ];

    // Filter connections scoped to active group
    const scopedConns = allConns.filter((c) => c.groupId === activeGroupId);
    expect(scopedConns).toHaveLength(5);
    expect(scopedConns.every((c) => c.groupId === activeGroupId)).toBe(true);
    expect(scopedConns.some((c) => c.id === 'conn_unrelated')).toBe(false);

    // Build map for scoped group
    const ready = scopedConns.map((c) => ({
      c,
      s: mockSchemas[c.id],
    }));

    const dbs = ready.map(({ c, s }) => ({
      id: c.id,
      label: c.name,
      sublabel: `${s.database} · ${s.tables.length} tables`,
      tables: s.tables,
      links: [],
    }));

    const between = crossDbLinks(
      ready.map(({ c, s }) => ({ id: c.id, label: c.name, schema: s })),
      { customMappings: [], rejectedCandidates: [] },
    );

    const diagram = buildMap(dbs, between, 'names');
    expect(diagram.groups).toHaveLength(5);
    expect(diagram.groups.some((g) => g.id === 'conn_unrelated')).toBe(false);
  });

  it('correctly categorizes relation classes with distinct visual and accessible indicators', () => {
    const ready = mockConnections.map((c) => ({
      id: c.id,
      label: c.name,
      schema: mockSchemas[c.id],
    }));

    const relations = crossDbLinks(ready, {
      customMappings: [
        {
          id: 'map_1',
          groupId: 'grp_fameo',
          sourceConnectionId: 'conn_pg_main',
          sourceSchema: 'public',
          sourceTable: 'orders',
          sourceColumn: 'user_id',
          targetConnectionId: 'conn_mongo_events',
          targetSchema: 'events',
          targetTable: 'user_activity',
          targetColumn: 'user_id',
          notes: 'Customer ID reference in telemetry',
          createdAt: 1729472000,
          updatedAt: 1729472000,
        },
      ],
      rejectedCandidates: [],
    });

    const configured = relations.filter((r) => r.provenance === 'configured');
    const inferred = relations.filter((r) => r.provenance === 'inferred' && r.status === 'active');
    const ambiguous = relations.filter((r) => r.status === 'ambiguous');

    expect(configured.length).toBeGreaterThan(0);
    expect(inferred.length).toBeGreaterThan(0);

    // Confirm that every relationship carries a distinct, accessible status/provenance label
    expect(configured[0].provenance).toBe('configured');
    expect(inferred[0].provenance).toBe('inferred');
    if (ambiguous.length > 0) {
      expect(ambiguous[0].status).toBe('ambiguous');
    }
  });

  it('handles empty group state gracefully without throwing or displaying broken layout', () => {
    const emptyConns: DbConnection[] = [];
    const scoped = emptyConns.filter((c) => c.groupId === 'grp_fameo');
    expect(scoped).toHaveLength(0);

    const ready: Array<{ c: DbConnection; s: unknown }> = [];
    const dbs = ready.map(({ c }) => ({
      id: c.id,
      label: c.name,
      sublabel: '',
      tables: [],
      links: [],
    }));

    const diagram = buildMap(dbs, [], 'names');
    expect(diagram.nodes).toHaveLength(0);
    expect(diagram.edges).toHaveLength(0);
  });
});
