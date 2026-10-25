import { describe, expect, it } from 'vitest';
import {
  getEngineCapabilities,
  globalTableKey,
  isValidObjectIdString,
  normalizeEngine,
  parseGlobalTableKey,
} from './capabilities';

describe('capabilities', () => {
  describe('normalizeEngine', () => {
    it('normalizes common engine strings', () => {
      expect(normalizeEngine('postgres')).toBe('postgres');
      expect(normalizeEngine('PostgreSQL')).toBe('postgres');
      expect(normalizeEngine('mysql')).toBe('mysql');
      expect(normalizeEngine('MySQL')).toBe('mysql');
      expect(normalizeEngine('mongo')).toBe('mongodb');
      expect(normalizeEngine('mongodb')).toBe('mongodb');
      expect(normalizeEngine('MongoDB')).toBe('mongodb');
      expect(normalizeEngine('redis')).toBe('redis');
      expect(normalizeEngine('Redis')).toBe('redis');
    });

    it('returns unknown for unsupported or empty engine strings', () => {
      expect(normalizeEngine('')).toBe('unknown');
      expect(normalizeEngine('oracle')).toBe('unknown');
      expect(normalizeEngine('sqlite')).toBe('unknown');
      expect(normalizeEngine('cassandra')).toBe('unknown');
    });
  });

  describe('getEngineCapabilities', () => {
    it('returns relational catalog capabilities for PostgreSQL', () => {
      const caps = getEngineCapabilities('postgres');
      expect(caps.isSupported).toBe(true);
      expect(caps.family).toBe('postgres');
      expect(caps.displayName).toBe('PostgreSQL');
      expect(caps.supportsNativeForeignKeys).toBe(true);
      expect(caps.supportsDiagram).toBe(true);
      expect(caps.supportsIndexes).toBe(true);
      expect(caps.supportsSql).toBe(true);
      expect(caps.supportsShellCommands).toBe(false);
      expect(caps.schemaInferenceType).toBe('catalog');
      expect(caps.isProbabilisticSchema).toBe(false);
      expect(caps.tableEntityLabel).toBe('table');
      expect(caps.tableEntityLabelPlural).toBe('tables');
    });

    it('returns relational catalog capabilities for MySQL', () => {
      const caps = getEngineCapabilities('mysql');
      expect(caps.isSupported).toBe(true);
      expect(caps.family).toBe('mysql');
      expect(caps.displayName).toBe('MySQL');
      expect(caps.supportsNativeForeignKeys).toBe(true);
      expect(caps.supportsDiagram).toBe(true);
      expect(caps.supportsIndexes).toBe(true);
      expect(caps.supportsSql).toBe(true);
      expect(caps.schemaInferenceType).toBe('catalog');
      expect(caps.isProbabilisticSchema).toBe(false);
    });

    it('returns document/sampled capabilities for MongoDB', () => {
      const caps = getEngineCapabilities('mongodb');
      expect(caps.isSupported).toBe(true);
      expect(caps.family).toBe('mongodb');
      expect(caps.displayName).toBe('MongoDB');
      expect(caps.supportsNativeForeignKeys).toBe(false);
      expect(caps.supportsDiagram).toBe(true);
      expect(caps.supportsDocumentBrowse).toBe(true);
      expect(caps.supportsShellCommands).toBe(true);
      expect(caps.supportsSql).toBe(false);
      expect(caps.schemaInferenceType).toBe('sampled');
      expect(caps.isProbabilisticSchema).toBe(true);
      expect(caps.tableEntityLabel).toBe('collection');
      expect(caps.tableEntityLabelPlural).toBe('collections');
      expect(caps.queryEditorLabel).toBe('Shell');
    });

    it('returns key-value scan capabilities for Redis', () => {
      const caps = getEngineCapabilities('redis');
      expect(caps.isSupported).toBe(true);
      expect(caps.family).toBe('redis');
      expect(caps.displayName).toBe('Redis');
      expect(caps.supportsNativeForeignKeys).toBe(false);
      expect(caps.supportsDiagram).toBe(false);
      expect(caps.supportsIndexes).toBe(false);
      expect(caps.supportsDocumentBrowse).toBe(true);
      expect(caps.supportsShellCommands).toBe(true);
      expect(caps.supportsSql).toBe(false);
      expect(caps.schemaInferenceType).toBe('keyspace_scan');
      expect(caps.isProbabilisticSchema).toBe(false);
      expect(caps.tableEntityLabel).toBe('prefix');
      expect(caps.tableEntityLabelPlural).toBe('prefixes');
      expect(caps.queryEditorLabel).toBe('Commands');
    });

    it('returns explicit unsupported info for unknown drivers without throwing', () => {
      const caps = getEngineCapabilities('couchdb');
      expect(caps.isSupported).toBe(false);
      expect(caps.family).toBe('unknown');
      expect(caps.supportsNativeForeignKeys).toBe(false);
      expect(caps.supportsDiagram).toBe(false);
      expect(caps.schemaInferenceType).toBe('unsupported');
      expect(caps.unsupportedReason).toBeDefined();
      expect(caps.unsupportedReason).toContain('Stackroost currently supports');
    });
  });

  describe('globalTableKey and parseGlobalTableKey', () => {
    it('constructs scoped identity incorporating connection ID', () => {
      const key = globalTableKey('conn_user_service', 'public.users');
      expect(key).toBe('conn_user_service::public.users');
    });

    it('differentiates identically named tables across different services', () => {
      const authUsers = globalTableKey('conn_auth_svc', 'public.users');
      const billingUsers = globalTableKey('conn_billing_svc', 'public.users');
      expect(authUsers).not.toBe(billingUsers);
    });

    it('parses valid global table keys', () => {
      const parsed = parseGlobalTableKey('conn_123::public.orders');
      expect(parsed).toEqual({
        connectionId: 'conn_123',
        tableKey: 'public.orders',
      });
    });

    it('returns null for keys without separator', () => {
      expect(parseGlobalTableKey('invalid_key')).toBeNull();
    });
  });

  describe('isValidObjectIdString', () => {
    it('accepts valid 24-character hex strings', () => {
      expect(isValidObjectIdString('507f1f77bcf86cd799439011')).toBe(true);
      expect(isValidObjectIdString('65f1a2b3c4d5e6f708192a3b')).toBe(true);
      expect(isValidObjectIdString('  65F1A2B3C4D5E6F708192A3B  ')).toBe(true);
    });

    it('rejects strings with incorrect length', () => {
      expect(isValidObjectIdString('507f1f77bcf86cd79943901')).toBe(false); // 23 chars
      expect(isValidObjectIdString('507f1f77bcf86cd799439011a')).toBe(false); // 25 chars
      expect(isValidObjectIdString('')).toBe(false);
    });

    it('rejects strings with non-hex characters', () => {
      expect(isValidObjectIdString('507f1f77bcf86cd79943901g')).toBe(false);
      expect(isValidObjectIdString('user_id_123456789012345678')).toBe(false);
    });
  });
});
