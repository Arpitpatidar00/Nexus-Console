import { describe, it, expect } from 'vitest';
import { backupRecordSchema, backupConfigSchema } from './backups.schema';

describe('backups schemas', () => {
  it('validates backup record', () => {
    const record = {
      id: 'bk-123456',
      source_type: 'postgres_remote',
      source_name: 'prod_api_db',
      target_file: '/Users/test/Library/Application Support/Stackroost/backups/prod_api_db.sql.gz',
      size_bytes: 41943040,
      created_at: 1773900000,
      status: 'success',
    };
    const parsed = backupRecordSchema.parse(record);
    expect(parsed.id).toBe('bk-123456');
    expect(parsed.size_bytes).toBe(41943040);
  });

  it('validates backup config for remote database', () => {
    const config = {
      source: 'remote',
      host_alias: 'prod-bastion',
      engine: 'postgres',
      database: 'users_service',
    };
    const parsed = backupConfigSchema.parse(config);
    expect(parsed.source).toBe('remote');
    expect(parsed.host_alias).toBe('prod-bastion');
  });
});
