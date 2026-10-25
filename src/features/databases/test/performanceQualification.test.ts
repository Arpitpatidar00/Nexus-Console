import { describe, it, expect } from 'vitest';
import { mockConnections, mockFameoGroupSchemas, mockSchemas } from './databaseMocks';
import { crossDbLinks } from '../utils/relations';
import { buildMap } from '../utils/diagram';
import type { DbConnection } from '../api/databases.schema';
import type { DbSchema, TableInfo } from '../api/explorer.schema';

describe('Phase 8 — Performance Qualification & Benchmark Suite', () => {
  it('Workload 1: Measures relation generation and graph layout on 5-service mixed engine group (Fameo)', () => {
    const startRelations = performance.now();
    const relations = crossDbLinks(mockFameoGroupSchemas, {
      customMappings: [],
      rejectedCandidates: [],
    });
    const relationsDuration = performance.now() - startRelations;

    expect(relations.length).toBeGreaterThan(0);
    // Budget: relation detection on 5 databases must complete in under 50ms
    expect(relationsDuration).toBeLessThan(50);

    const dbs = mockFameoGroupSchemas.map(({ id, label, schema }) => ({
      id,
      label,
      sublabel: `${schema.database} · ${schema.tables.length} tables`,
      tables: schema.tables,
      links: [],
    }));

    const startLayout = performance.now();
    const diagram = buildMap(dbs, relations, 'names');
    const layoutDuration = performance.now() - startLayout;

    expect(diagram.groups).toHaveLength(5);
    expect(diagram.nodes.length).toBeGreaterThan(5);
    // Budget: diagram graph layout must complete in under 100ms
    expect(layoutDuration).toBeLessThan(100);
  });

  it('Workload 2: Measures scalability on synthetic 10-database cluster with 100 tables', () => {
    // Generate synthetic 10-database cluster
    const syntheticDatabases: Array<{ id: string; label: string; schema: DbSchema }> = [];

    for (let dbIdx = 1; dbIdx <= 10; dbIdx++) {
      const tables: TableInfo[] = [];
      for (let tblIdx = 1; tblIdx <= 10; tblIdx++) {
        tables.push({
          schema: 'public',
          name: `entity_${dbIdx}_${tblIdx}`,
          kind: 'table',
          rowEstimate: 1000 * tblIdx,
          sizeBytes: 1024 * 1024 * tblIdx,
          comment: `Synthetic table ${tblIdx}`,
          columns: [
            {
              name: 'id',
              dataType: 'uuid',
              nullable: false,
              default: 'gen_random_uuid()',
              isPrimary: true,
              isUnique: true,
              comment: null,
              presence: null,
            },
            {
              name: `service_${(dbIdx % 10) + 1}_id`,
              dataType: 'uuid',
              nullable: true,
              default: null,
              isPrimary: false,
              isUnique: false,
              comment: null,
              presence: null,
            },
          ],
          indexes: [],
        });
      }

      syntheticDatabases.push({
        id: `conn_synth_${dbIdx}`,
        label: `Microservice ${dbIdx}`,
        schema: {
          engine: dbIdx % 2 === 0 ? 'postgres' : 'mysql',
          database: `service_db_${dbIdx}`,
          serverVersion: '16.0',
          sizeBytes: 50 * 1024 * 1024,
          schemas: ['public'],
          tables,
          relations: [],
        },
      });
    }

    const t0 = performance.now();
    const between = crossDbLinks(syntheticDatabases, {
      customMappings: [],
      rejectedCandidates: [],
    });
    const relationElapsed = performance.now() - t0;

    // Budget: 10 databases with 100 tables evaluated in under 150ms
    expect(relationElapsed).toBeLessThan(150);

    const dbs = syntheticDatabases.map(({ id, label, schema }) => ({
      id,
      label,
      sublabel: `${schema.database} · 10 tables`,
      tables: schema.tables,
      links: [],
    }));

    const tLayout0 = performance.now();
    const diagram = buildMap(dbs, between, 'names');
    const layoutElapsed = performance.now() - tLayout0;

    expect(diagram.groups).toHaveLength(10);
    expect(diagram.nodes).toHaveLength(100);
    // Budget: Layout for 100 nodes and all edges completes in under 200ms
    expect(layoutElapsed).toBeLessThan(200);
  });
  it('Workload 3: Measures high-ambiguity resolution on repeated table names', () => {
    // 3 services all having a `users` table
    const ambiguousGroup: Array<{ id: string; label: string; schema: DbSchema }> = [
      {
        id: 'conn_auth',
        label: 'Auth DB',
        schema: {
          engine: 'postgres',
          database: 'auth',
          serverVersion: '16.0',
          sizeBytes: 1024,
          schemas: ['public'],
          tables: [
            {
              schema: 'public',
              name: 'users',
              kind: 'table',
              rowEstimate: 100,
              sizeBytes: 1024,
              comment: null,
              columns: [
                {
                  name: 'id',
                  dataType: 'uuid',
                  nullable: false,
                  default: null,
                  isPrimary: true,
                  isUnique: true,
                  comment: null,
                  presence: null,
                },
              ],
              indexes: [],
            },
          ],
          relations: [],
        },
      },
      {
        id: 'conn_billing',
        label: 'Billing DB',
        schema: {
          engine: 'postgres',
          database: 'billing',
          serverVersion: '16.0',
          sizeBytes: 2048,
          schemas: ['public'],
          tables: [
            {
              schema: 'public',
              name: 'users',
              kind: 'table',
              rowEstimate: 100,
              sizeBytes: 1024,
              comment: null,
              columns: [
                {
                  name: 'id',
                  dataType: 'uuid',
                  nullable: false,
                  default: null,
                  isPrimary: true,
                  isUnique: true,
                  comment: null,
                  presence: null,
                },
              ],
              indexes: [],
            },
            {
              schema: 'public',
              name: 'invoices',
              kind: 'table',
              rowEstimate: 200,
              sizeBytes: 1024,
              comment: null,
              columns: [
                {
                  name: 'id',
                  dataType: 'uuid',
                  nullable: false,
                  default: null,
                  isPrimary: true,
                  isUnique: true,
                  comment: null,
                  presence: null,
                },
                {
                  name: 'user_id',
                  dataType: 'uuid',
                  nullable: false,
                  default: null,
                  isPrimary: false,
                  isUnique: false,
                  comment: null,
                  presence: null,
                },
              ],
              indexes: [],
            },
          ],
          relations: [],
        },
      },
      {
        id: 'conn_support',
        label: 'Support DB',
        schema: {
          engine: 'mysql',
          database: 'support',
          serverVersion: '8.0',
          sizeBytes: 2048,
          schemas: ['support'],
          tables: [
            {
              schema: 'support',
              name: 'users',
              kind: 'table',
              rowEstimate: 100,
              sizeBytes: 1024,
              comment: null,
              columns: [
                {
                  name: 'id',
                  dataType: 'uuid',
                  nullable: false,
                  default: null,
                  isPrimary: true,
                  isUnique: true,
                  comment: null,
                  presence: null,
                },
              ],
              indexes: [],
            },
            {
              schema: 'support',
              name: 'tickets',
              kind: 'table',
              rowEstimate: 300,
              sizeBytes: 1024,
              comment: null,
              columns: [
                {
                  name: 'id',
                  dataType: 'uuid',
                  nullable: false,
                  default: null,
                  isPrimary: true,
                  isUnique: true,
                  comment: null,
                  presence: null,
                },
                {
                  name: 'user_id',
                  dataType: 'uuid',
                  nullable: false,
                  default: null,
                  isPrimary: false,
                  isUnique: false,
                  comment: null,
                  presence: null,
                },
              ],
              indexes: [],
            },
          ],
          relations: [],
        },
      },
    ];

    const t0 = performance.now();
    const relations = crossDbLinks(ambiguousGroup, {
      customMappings: [],
      rejectedCandidates: [],
    });
    const elapsed = performance.now() - t0;

    const ambiguous = relations.filter((r) => r.status === 'ambiguous');
    expect(ambiguous.length).toBeGreaterThan(0);
    expect(ambiguous[0].candidates?.length).toBeGreaterThanOrEqual(2);
    expect(elapsed).toBeLessThan(50);
  });

  it('Workload 4: Confirms partial group rendering when one database is offline', () => {
    const conns: DbConnection[] = [...mockConnections];
    const availableSchemas: Record<string, DbSchema> = { ...mockSchemas };
    // Simulate conn_pg_auth failing / offline
    delete (availableSchemas as Record<string, DbSchema | undefined>)['conn_pg_auth'];

    const ready = conns
      .map((c) => ({ c, s: availableSchemas[c.id] }))
      .filter((x): x is { c: DbConnection; s: DbSchema } => x.s != null);

    const failed = conns.filter((c) => availableSchemas[c.id] == null);

    expect(ready).toHaveLength(4);
    expect(failed).toHaveLength(1);
    expect(failed[0].id).toBe('conn_pg_auth');

    // Partial map is successfully generated
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
    expect(diagram.groups).toHaveLength(4);
    expect(diagram.nodes.length).toBeGreaterThan(0);
  });
});
