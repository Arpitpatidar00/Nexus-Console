import { test, expect } from 'vitest';
import contracts from '../../../../fixtures/databases/explorer-contracts.json';
import { dbSchemaSchema } from '@/features/databases/api/explorer.schema';
import { buildDiagram, buildMap, HEADER_H, ROW_H, type DiagramNode } from './diagram';
import { declaredLinks, linksOf } from './relations';

const pg = dbSchemaSchema.parse(contracts.postgres);
const my = dbSchemaSchema.parse(contracts.mysql);

const overlap = (a: DiagramNode, b: DiagramNode) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const noOverlaps = (nodes: DiagramNode[]) => {
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++)
      expect(overlap(nodes[i], nodes[j]), `${nodes[i].id} × ${nodes[j].id}`).toBe(false);
};

test('every table placed once, none overlapping, all inside the canvas', () => {
  const d = buildDiagram(pg.tables, linksOf(pg), 'all');
  expect(d.nodes).toHaveLength(pg.tables.length);
  noOverlaps(d.nodes);
  for (const n of d.nodes) {
    expect(n.x).toBeGreaterThanOrEqual(0);
    expect(n.y).toBeGreaterThanOrEqual(0);
    expect(n.x + n.w).toBeLessThanOrEqual(d.width);
    expect(n.y + n.h).toBeLessThanOrEqual(d.height);
  }
});

test('referenced tables sit left of the tables that point at them', () => {
  const d = buildDiagram(pg.tables, linksOf(pg), 'all');
  const at = (id: string) => d.nodes.find((n) => n.id === id)!;
  expect(at('public.users').x).toBeLessThan(at('public.posts').x);
  expect(at('public.posts').x).toBeLessThan(at('public.comments').x);
  expect(at('billing.plans').x).toBeLessThan(at('billing.subscriptions').x);
  expect(at('billing.subscriptions').x).toBeLessThan(at('billing.invoices').x);
});

test('one edge per foreign key; a self-reference loops back to its own table', () => {
  const d = buildDiagram(pg.tables, declaredLinks(pg), 'all');
  expect(d.edges).toHaveLength(pg.relations.length);
  const self = d.edges.find((e) => e.from === 'public.users' && e.to === 'public.users')!;
  expect(self.start.x).toBe(self.end.x);
  expect(self.path).toMatch(/^M [\d.]+ [\d.]+ C /);
});

test('detail levels: all columns, keys only, names only', () => {
  const users = (detail: 'all' | 'keys' | 'names') =>
    buildDiagram(pg.tables, linksOf(pg), detail).nodes.find((n) => n.id === 'public.users')!;
  expect(users('all').columns).toHaveLength(7);
  // id (pk) and invited_by (fk).
  expect(users('keys').columns.map((c) => c.name)).toEqual(['id', 'invited_by']);
  expect(users('keys').hidden).toBe(5);
  expect(users('names').columns).toHaveLength(0);
  expect(users('names').h).toBe(HEADER_H);
  expect(users('keys').h).toBe(HEADER_H + 3 * ROW_H + 8);
});

test('two schemas label their tables', () => {
  const d = buildDiagram(pg.tables, linksOf(pg), 'names');
  expect(d.nodes.find((n) => n.id === 'billing.plans')!.subtitle).toBe('billing');
});

test('the map boxes each database and links across them', () => {
  const d = buildMap(
    [
      { id: 'pg', label: 'Local PG', sublabel: 'postgres', tables: pg.tables, links: linksOf(pg) },
      { id: 'my', label: 'Shop', sublabel: 'mysql', tables: my.tables, links: linksOf(my) },
    ],
    [
      {
        id: 'cross:1',
        name: 'x',
        from: 'shop.customers',
        fromColumns: ['email'],
        to: 'public.users',
        toColumns: ['email'],
        inferred: true,
        onDelete: null,
        fromDb: 'my',
        toDb: 'pg',
        provenance: 'inferred',
        status: 'active',
      },
    ],
    'names',
  );
  expect(d.groups.map((g) => g.id)).toEqual(['pg', 'my']);
  noOverlaps(d.nodes);
  for (const g of d.groups) {
    const inside = d.nodes.filter((n) => n.id.startsWith(`${g.id}/`));
    expect(inside.length).toBeGreaterThan(0);
    for (const n of inside) {
      expect(n.x).toBeGreaterThanOrEqual(g.x);
      expect(n.x + n.w).toBeLessThanOrEqual(g.x + g.w);
      expect(n.y + n.h).toBeLessThanOrEqual(g.y + g.h);
    }
  }
  const crossing = d.edges.find((e) => e.id === 'cross:1')!;
  expect(crossing.from).toBe('my/shop.customers');
  expect(crossing.to).toBe('pg/public.users');
  expect(crossing.inferred).toBe(true);
  expect(d.edges.length).toBe(pg.relations.length + my.relations.length + 1);
});

test('a large flat database still lays out without overlaps', () => {
  const many = Array.from({ length: 120 }, (_, i) => ({
    ...pg.tables[i % pg.tables.length],
    name: `t${i}`,
  }));
  const d = buildDiagram(many, [], 'keys');
  expect(d.nodes).toHaveLength(120);
  noOverlaps(d.nodes);
  // Roughly landscape, not one endless row or column.
  expect(d.width / d.height).toBeGreaterThan(0.5);
  expect(d.width / d.height).toBeLessThan(4);
});
