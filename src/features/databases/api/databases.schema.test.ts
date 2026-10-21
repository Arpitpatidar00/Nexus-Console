import { describe, it, expect } from 'vitest';
import { dbConnectionSchema, queryResultSchema, dbSnapshotSchema } from './databases.schema';

describe('databases.schema', () => {
  it('parses valid database connection', () => {
    const raw = {
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
    const parsed = dbConnectionSchema.parse(raw);
    expect(parsed.name).toBe('Primary Postgres');
    expect(parsed.port).toBe(5432);
    expect(parsed.allowWrites).toBe(false);
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
