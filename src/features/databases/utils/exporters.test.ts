import { test, expect } from 'vitest';
import contracts from '../../../../fixtures/databases/explorer-contracts.json';
import { dbSchemaSchema } from '@/features/databases/api/explorer.schema';
import { buildDiagram } from './diagram';
import {
  escapeXml,
  over,
  parseColor,
  renderSvg,
  resolvePalette,
  SCREEN_PALETTE,
} from './diagramSvg';
import { fileStem, toMermaid } from './mermaid';
import { linksOf, inferredLinks } from './relations';
import { kindOf, preview, scalarText } from './values';
import { parseConnectionUrl } from './connectionUrl';

const pg = dbSchemaSchema.parse(contracts.postgres);

test('the SVG carries hit-test attributes, escapes text and dashes guesses', () => {
  const evil = { ...pg.tables[0], name: '<script>"x"&' };
  const d = buildDiagram([...pg.tables, evil], linksOf(pg), 'all');
  d.edges[0].inferred = true;
  const svg = renderSvg(d, SCREEN_PALETTE, {
    title: 'Demo & co',
    highlight: new Set(['public.users']),
  });
  expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
  expect(svg).toContain('data-table="public.users"');
  expect(svg).toContain('data-from="public.posts"');
  expect(svg).toContain('&lt;script&gt;&quot;x&quot;&amp;');
  expect(svg).not.toContain('<script>');
  expect(svg).toContain('Demo &amp; co');
  expect(svg).toContain('stroke-dasharray="5 4"');
  expect(svg).toContain('fill:var(--card)');
  // Well-formed: every opened group closes.
  expect(svg.match(/<g[ >]/g)!.length).toBe(svg.match(/<\/g>/g)!.length);
});

test('export colours are opaque: translucent surfaces flatten onto the background', () => {
  expect(parseColor('#fff')).toEqual([255, 255, 255, 1]);
  expect(parseColor('rgba(12, 12, 14, 0.08)')).toEqual([12, 12, 14, 0.08]);
  expect(over('rgba(255, 255, 255, 0.5)', '#000000')).toBe('rgb(128, 128, 128)');
  const vars: Record<string, string> = {
    '--background': '#141215',
    '--card': 'rgba(255, 255, 255, 0.06)',
    '--muted': 'rgba(255, 255, 255, 0.05)',
    '--border': 'rgba(255, 255, 255, 0.1)',
    '--foreground': '#f4f1ec',
    '--muted-foreground': '#a8a3a0',
    '--warning': '#f7c64b',
    '--info': '#7cc4ff',
    '--ember': '#ff7a2f',
  };
  const p = resolvePalette((v) => vars[v] ?? '');
  expect(p.canvas).toBe('rgb(20, 18, 21)');
  expect(p.card).toBe('rgb(34, 32, 35)');
  for (const c of Object.values(p)) expect(c).not.toContain('var(');
  expect(escapeXml(`a<b>"c'&`)).toBe('a&lt;b&gt;&quot;c&apos;&amp;');
});

test('Mermaid output is valid erDiagram text', () => {
  const m = toMermaid(pg.tables, linksOf(pg));
  expect(m.startsWith('erDiagram\n')).toBe(true);
  expect(m).toContain('  public_users {');
  expect(m).toContain('    uuid id PK');
  expect(m).toContain('    text email UK');
  expect(m).toContain('    timestamp_with_time_zone created_at');
  expect(m).toContain('    text role "member | admin"');
  // users.invited_by is nullable: zero-or-one parent.
  expect(m).toContain('  public_users |o--o{ public_users : "invited_by"');
  expect(m).toContain('  public_posts ||--o{ public_comments : "post_id"');
  expect(inferredLinks(pg)).toHaveLength(0);
  expect(fileStem('Fameo DEV (Neon)', 'diagram')).toBe('fameo-dev-neon-diagram');
});

test('values: EJSON wrappers, dates, previews', () => {
  expect(kindOf({ $oid: '65f0a1b2c3d4e5f601234567' })).toBe('objectId');
  expect(kindOf({ $date: '2026-10-23T12:00:00Z' })).toBe('date');
  expect(kindOf('2026-10-23T12:00:00+00:00')).toBe('date');
  expect(kindOf({ $numberLong: '9007199254740993' })).toBe('number');
  expect(kindOf({ a: 1 })).toBe('object');
  expect(kindOf(null)).toBe('null');
  expect(scalarText({ $oid: 'abc' })).toBe('abc');
  expect(preview([1, 2, 3])).toBe('[3 items]');
  expect(preview({ a: 1 })).toBe('{1 field}');
  expect(preview('a\n  b', 80)).toBe('a b');
  expect(preview('x'.repeat(100), 10)).toBe('xxxxxxxxx…');
});

test('connection URLs fill the form', () => {
  const neon = parseConnectionUrl(
    'DATABASE_URL=postgresql://neondb_owner:p%40ss@ep-dry-sunset.ap-southeast-1.aws.neon.tech/fameouat_um?sslmode=require&schema=public',
  );
  expect(neon).toEqual({
    engine: 'postgres',
    host: 'ep-dry-sunset.ap-southeast-1.aws.neon.tech',
    port: 5432,
    user: 'neondb_owner',
    password: 'p@ss',
    database: 'fameouat_um',
    params: { sslmode: 'require', schema: 'public' },
  });
  expect(parseConnectionUrl('mysql://root@127.0.0.1:3307/shop')).toMatchObject({
    engine: 'mysql',
    port: 3307,
    password: '',
  });
  expect(parseConnectionUrl('redis://:secret@cache:6380/2')).toMatchObject({
    engine: 'redis',
    password: 'secret',
    database: '2',
  });
  expect(parseConnectionUrl('mongodb+srv://u:p@cluster0.mongodb.net/db')).toHaveProperty('error');
  expect(parseConnectionUrl('postgres://a@h1:5432,h2:5432/db')).toHaveProperty('error');
  expect(parseConnectionUrl('not a url')).toHaveProperty('error');
});
