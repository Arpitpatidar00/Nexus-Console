import { test, expect } from 'vitest';
import contracts from '../../../../fixtures/databases/explorer-contracts.json';
import { dbSchemaSchema, type DbSchema } from '@/features/databases/api/explorer.schema';
import {
  columnRefs,
  crossDbLinks,
  declaredLinks,
  inferredLinks,
  neighborhood,
  referencedName,
} from './relations';

const pg = dbSchemaSchema.parse(contracts.postgres);

const col = (name: string, isPrimary = false) => ({
  name,
  dataType: 'uuid',
  nullable: !isPrimary,
  default: null,
  isPrimary,
  isUnique: isPrimary,
  comment: null,
  presence: null,
});
const table = (schema: string, name: string, cols: string[]) => ({
  schema,
  name,
  kind: 'table',
  rowEstimate: 0,
  sizeBytes: 0,
  comment: null,
  columns: [col('id', true), ...cols.map((c) => col(c))],
  indexes: [],
});
const db = (database: string, tables: ReturnType<typeof table>[]): DbSchema => ({
  engine: 'postgres',
  database,
  serverVersion: null,
  sizeBytes: null,
  schemas: ['public'],
  tables,
  relations: [],
});

test('declared foreign keys from a real catalog', () => {
  const links = declaredLinks(pg);
  expect(links).toHaveLength(9);
  const composite = links.find((l) => l.from === 'billing.invoices')!;
  expect(composite.to).toBe('billing.subscriptions');
  expect(composite.fromColumns).toEqual(['user_id', 'plan_code']);
  expect(links.every((l) => !l.inferred)).toBe(true);
});

test('reference names', () => {
  expect(referencedName('user_id')).toBe('user');
  expect(referencedName('authorId')).toBe('author');
  expect(referencedName('category_uuid')).toBe('category');
  expect(referencedName('id')).toBe(null);
  expect(referencedName('paid')).toBe(null);
});

test('a column covered by a real FK is never guessed again', () => {
  // posts.author_id has a declared FK; audit_events.actor_id has no `actors` table.
  expect(inferredLinks(pg)).toEqual([]);
});

test('guesses a reference only when exactly one table matches', () => {
  const s = db('app', [
    table('public', 'categories', []),
    table('public', 'products', ['category_id', 'brand_id']),
    table('public', 'brand', []),
    table('public', 'brands', []),
  ]);
  const g = inferredLinks(s);
  expect(g.map((l) => [l.from, l.to])).toEqual([['public.products', 'public.categories']]);
  expect(g[0]).toMatchObject({ inferred: true, toColumns: ['id'] });
});

test('microservice databases link through shared names', () => {
  const um = db('fameo_um', [table('public', 'users', [])]);
  const chat = db('fameo_chat', [
    table('public', 'messages', ['user_id', 'conversation_id']),
    table('public', 'conversations', []),
  ]);
  const links = crossDbLinks([
    { id: 'um', label: 'User management', schema: um },
    { id: 'chat', label: 'Chat', schema: chat },
  ]);
  // conversation_id stays inside chat (its own table matches); user_id crosses.
  expect(links).toHaveLength(1);
  expect(links[0]).toMatchObject({
    from: 'public.messages',
    to: 'public.users',
    fromDb: 'chat',
    toDb: 'um',
    inferred: true,
  });
});

test('neighborhood and per-column references', () => {
  const links = declaredLinks(pg);
  expect([...neighborhood('public.posts', links)].sort()).toEqual([
    'public.categories',
    'public.comments',
    'public.posts',
    'public.users',
  ]);
  const { outgoing, incoming } = columnRefs('public.users', links);
  expect(outgoing.get('invited_by')?.to).toBe('public.users');
  expect(incoming.map((l) => l.from).sort()).toEqual([
    'billing.subscriptions',
    'public.comments',
    'public.posts',
    'public.users',
  ]);
});

test('foreign keys without a supporting index', async () => {
  const { unindexedForeignKeys, tablesWithoutPrimaryKey } = await import('./relations');
  const links = declaredLinks(pg);
  const at = (name: string) => pg.tables.find((t) => t.name === name)!;
  // posts.author_id leads posts_author_created_idx; posts.category_id has no index.
  expect(unindexedForeignKeys(at('posts'), links).map((l) => l.fromColumns)).toEqual([
    ['category_id'],
  ]);
  // subscriptions' PK (user_id, plan_code) covers user_id but not plan_code alone.
  expect(unindexedForeignKeys(at('subscriptions'), links).map((l) => l.fromColumns)).toEqual([
    ['plan_code'],
  ]);
  expect(tablesWithoutPrimaryKey(pg)).toEqual([]);
});

test('classifyTypeCompatibility detects compatible and incompatible types', async () => {
  const { classifyTypeCompatibility } = await import('./relations');

  expect(classifyTypeCompatibility('uuid', 'uuid').compatibility).toBe('compatible');
  expect(classifyTypeCompatibility('bigint', 'integer').compatibility).toBe('compatible');
  expect(classifyTypeCompatibility('varchar(255)', 'text').compatibility).toBe('compatible');
  expect(classifyTypeCompatibility('string', 'objectId').compatibility).toBe('compatible');

  // Incompatible types (ISS-07)
  const intVsOid = classifyTypeCompatibility('bigint', 'objectId');
  expect(intVsOid.compatibility).toBe('incompatible');
  expect(intVsOid.reason).toContain('Numeric integer cannot map');

  const boolVsDate = classifyTypeCompatibility('boolean', 'timestamp');
  expect(boolVsDate.compatibility).toBe('incompatible');

  // Unknown/missing
  expect(classifyTypeCompatibility(null, 'uuid').compatibility).toBe('unknown');
});

test('crossDbLinks detects multiple matching targets as ambiguous rather than silently dropping them', () => {
  const chat = db('chat_service', [table('public', 'messages', ['user_id'])]);
  const auth = db('auth_service', [table('public', 'users', [])]);
  const billing = db('billing_service', [table('public', 'users', [])]);

  const links = crossDbLinks([
    { id: 'chat', label: 'Chat', schema: chat },
    { id: 'auth', label: 'Auth', schema: auth },
    { id: 'billing', label: 'Billing', schema: billing },
  ]);

  // ISS-01 fix: must NOT drop the relation! Must report ambiguous candidate set.
  expect(links).toHaveLength(1);
  const link = links[0];
  expect(link.status).toBe('ambiguous');
  expect(link.provenance).toBe('inferred');
  expect(link.candidates).toHaveLength(2);
  expect(link.candidates?.map((c) => c.targetDb).sort()).toEqual(['auth', 'billing']);
});

test('crossDbLinks respects rejected candidates', () => {
  const chat = db('chat_service', [table('public', 'messages', ['user_id'])]);
  const auth = db('auth_service', [table('public', 'users', [])]);
  const billing = db('billing_service', [table('public', 'users', [])]);

  // User rejected candidate to billing_service
  const links = crossDbLinks(
    [
      { id: 'chat', label: 'Chat', schema: chat },
      { id: 'auth', label: 'Auth', schema: auth },
      { id: 'billing', label: 'Billing', schema: billing },
    ],
    {
      rejectedCandidates: [
        {
          id: 'rej_1',
          groupId: 'grp_1',
          sourceConnectionId: 'chat',
          sourceSchema: 'public',
          sourceTable: 'messages',
          sourceColumn: 'user_id',
          targetConnectionId: 'billing',
          targetSchema: 'public',
          targetTable: 'users',
          targetColumn: 'id',
          createdAt: 100,
        },
      ],
    },
  );

  // Now only auth_service remains as candidate; resolves unambiguously
  expect(links).toHaveLength(1);
  expect(links[0].status).toBe('active');
  expect(links[0].toDb).toBe('auth');
});

test('crossDbLinks resolves custom mappings and flags stale ones', () => {
  const chat = db('chat_service', [table('public', 'messages', ['user_id'])]);
  const auth = db('auth_service', [table('public', 'users', [])]);

  // 1. Valid custom mapping
  const activeLinks = crossDbLinks(
    [
      { id: 'chat', label: 'Chat', schema: chat },
      { id: 'auth', label: 'Auth', schema: auth },
    ],
    {
      customMappings: [
        {
          id: 'custom_1',
          groupId: 'grp_1',
          sourceConnectionId: 'chat',
          sourceSchema: 'public',
          sourceTable: 'messages',
          sourceColumn: 'user_id',
          targetConnectionId: 'auth',
          targetSchema: 'public',
          targetTable: 'users',
          targetColumn: 'id',
          notes: 'Configured link',
          createdAt: 100,
          updatedAt: 100,
        },
      ],
    },
  );

  expect(activeLinks).toHaveLength(1);
  expect(activeLinks[0].provenance).toBe('configured');
  expect(activeLinks[0].status).toBe('active');
  expect(activeLinks[0].notes).toBe('Configured link');

  // 2. Stale custom mapping (target table deleted)
  const staleLinks = crossDbLinks(
    [
      { id: 'chat', label: 'Chat', schema: chat },
      { id: 'auth', label: 'Auth', schema: db('auth_service', []) }, // no tables
    ],
    {
      customMappings: [
        {
          id: 'custom_1',
          groupId: 'grp_1',
          sourceConnectionId: 'chat',
          sourceSchema: 'public',
          sourceTable: 'messages',
          sourceColumn: 'user_id',
          targetConnectionId: 'auth',
          targetSchema: 'public',
          targetTable: 'users',
          targetColumn: 'id',
          notes: 'Configured link',
          createdAt: 100,
          updatedAt: 100,
        },
      ],
    },
  );

  expect(staleLinks).toHaveLength(1);
  expect(staleLinks[0].status).toBe('stale');
  expect(staleLinks[0].compatibilityReason).toContain('could not be resolved');
});
