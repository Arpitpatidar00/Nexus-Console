import { describe, it, expect } from 'vitest';
import {
  dbConnectionSchema,
  dbGroupSchema,
  createGroupInputSchema,
  updateGroupInputSchema,
  updateConnectionInputSchema,
  queryResultSchema,
  dbSnapshotSchema,
} from './databases.schema';

describe('databases.schema', () => {
  it('parses valid database connection with and without groupId (legacy)', () => {
    const rawLegacy = {
      id: 'db_123',
      name: 'Primary Postgres',
      driver: 'postgres',
      host: '127.0.0.1',
      port: 5432,
      user: 'postgres',
      database: 'app_dev',
      tunnelId: null,
      allowWrites: false,
      env: 'dev',
      dataDir: '/opt/homebrew/var/postgresql@16',
    };
    const parsedLegacy = dbConnectionSchema.parse(rawLegacy);
    expect(parsedLegacy.name).toBe('Primary Postgres');
    expect(parsedLegacy.port).toBe(5432);
    expect(parsedLegacy.allowWrites).toBe(false);
    expect(parsedLegacy.groupId).toBeNull();

    const withGroup = { ...rawLegacy, groupId: 'grp_fameo' };
    const parsedWithGroup = dbConnectionSchema.parse(withGroup);
    expect(parsedWithGroup.groupId).toBe('grp_fameo');
  });

  it('parses dbGroupSchema and group inputs', () => {
    const groupRaw = {
      id: 'grp_1',
      name: 'Fameo Cluster',
      description: 'Microservice data stores',
      color: '#6366f1',
      createdAt: 1729472800,
      updatedAt: 1729472850,
    };
    const parsedGroup = dbGroupSchema.parse(groupRaw);
    expect(parsedGroup.name).toBe('Fameo Cluster');
    expect(parsedGroup.color).toBe('#6366f1');

    const createInput = createGroupInputSchema.parse({
      name: 'Auth Services',
      description: 'User management',
    });
    expect(createInput.name).toBe('Auth Services');

    const updateInput = updateGroupInputSchema.parse({
      id: 'grp_1',
      name: 'Updated Cluster',
    });
    expect(updateInput.id).toBe('grp_1');
  });

  it('parses updateConnectionInputSchema', () => {
    const updateConn = updateConnectionInputSchema.parse({
      id: 'db_123',
      name: 'Updated PG',
      driver: 'postgres',
      host: '127.0.0.1',
      port: 5433,
      allowWrites: true,
      env: 'staging',
      groupId: 'grp_1',
    });
    expect(updateConn.port).toBe(5433);
    expect(updateConn.groupId).toBe('grp_1');
  });

  it('parses query result with rows and duration', () => {
    const raw = {
      columns: ['id', 'email'],
      rows: [
        [1, 'test@example.com'],
        [2, 'dev@example.com'],
      ],
      rowCount: 2,
      durationMs: 14,
    };
    const parsed = queryResultSchema.parse(raw);
    expect(parsed.columns).toHaveLength(2);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.durationMs).toBe(14);
  });

  it('parses APFS database snapshot', () => {
    const raw = {
      id: '1729472800_before_migration',
      service: 'postgresql@16',
      label: 'before_migration',
      path: '/opt/homebrew/var/postgresql@16-nexus-snapshots/1729472800_before_migration',
      createdAt: 1729472800,
      sizeBytes: 1048576,
    };
    const parsed = dbSnapshotSchema.parse(raw);
    expect(parsed.label).toBe('before_migration');
    expect(parsed.sizeBytes).toBe(1048576);
  });
});
