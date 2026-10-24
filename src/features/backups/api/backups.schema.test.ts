import { describe, it, expect } from 'vitest';
import { backupRecordSchema, backupConfigSchema } from './backups.schema';

describe('backups schemas', () => {
  it('validates backup record', () => {
    const record = {
      id: 'bk-123456',
      sourceType: 'postgres_remote',
      sourceName: 'prod_api_db',
      targetFile: '/Users/test/Library/Application Support/Stackroost/backups/prod_api_db.sql.gz',
      sizeBytes: 41943040,
      createdAt: 1773900000,
      status: 'success',
    };
    const parsed = backupRecordSchema.parse(record);
    expect(parsed.id).toBe('bk-123456');
    expect(parsed.sizeBytes).toBe(41943040);
  });

  it('validates backup config for remote database', () => {
    const config = {
      source: 'remote',
      hostAlias: 'prod-bastion',
      engine: 'postgres',
      database: 'users_service',
    };
    const parsed = backupConfigSchema.parse(config);
    expect(parsed.source).toBe('remote');
    expect(parsed.hostAlias).toBe('prod-bastion');
  });
});
