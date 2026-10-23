import type { DbSchema, TableInfo } from '@/features/databases/api/explorer.schema';

export const tableKey = (schema: string, name: string) => `${schema}.${name}`;
export const keyOf = (t: Pick<TableInfo, 'schema' | 'name'>) => tableKey(t.schema, t.name);

/** A reference from one table's columns to another's. `db` ids are set for
 * links that cross databases (the all-databases map). */
export interface Link {
  id: string;
  name: string;
  from: string;
  fromColumns: string[];
  to: string;
  toColumns: string[];
  /** Guessed from column and table names: no foreign key says so. */
  inferred: boolean;
  onDelete: string | null;
  fromDb?: string;
  toDb?: string;
}

export function declaredLinks(s: DbSchema): Link[] {
  return s.relations.map((r) => ({
    id: `fk:${r.fromSchema}.${r.fromTable}.${r.name}`,
    name: r.name,
    from: tableKey(r.fromSchema, r.fromTable),
    fromColumns: r.fromColumns,
    to: tableKey(r.toSchema, r.toTable),
    toColumns: r.toColumns,
    inferred: r.inferred,
    onDelete: r.onDelete,
  }));
}

const norm = (s: string) => s.toLowerCase().replace(/[_\-\s]/g, '');

/** `user_id`, `userId`, `user_uuid` → `user`; the PK column itself and plain
 * `id` refer to nothing. */
export function referencedName(column: string): string | null {
  const m = /^(.+?)(?:_id|Id|ID|_uuid|Uuid|_key)$/.exec(column);
  return m ? m[1] : null;
}

/** Table names a reference base could mean: singular, plural, -ies. */
function nameMatches(base: string, table: string): boolean {
  const b = norm(base);
  const t = norm(table);
  return (
    t === b || t === `${b}s` || t === `${b}es` || (b.endsWith('y') && t === `${b.slice(0, -1)}ies`)
  );
}

const primaryColumn = (t: TableInfo) =>
  t.columns.find((c) => c.isPrimary)?.name ??
  t.columns.find((c) => c.name === 'id' || c.name === '_id')?.name;

/** Columns that look like references but have no foreign key: `actor_id`
 * with an `actors` table. Only when exactly one table matches. */
export function inferredLinks(s: DbSchema): Link[] {
  const covered = new Set(
    s.relations.flatMap((r) =>
      r.fromColumns.map((c) => `${tableKey(r.fromSchema, r.fromTable)}:${c}`),
    ),
  );
  const out: Link[] = [];
  for (const t of s.tables) {
    for (const c of t.columns) {
      if (c.isPrimary || covered.has(`${keyOf(t)}:${c.name}`)) continue;
      const base = referencedName(c.name);
      if (!base) continue;
      const targets = s.tables.filter((x) => nameMatches(base, x.name) && primaryColumn(x));
      if (targets.length !== 1) continue;
      const target = targets[0];
      out.push({
        id: `guess:${keyOf(t)}.${c.name}`,
        name: `${c.name} → ${target.name}`,
        from: keyOf(t),
        fromColumns: [c.name],
        to: keyOf(target),
        toColumns: [primaryColumn(target)!],
        inferred: true,
        onDelete: null,
      });
    }
  }
  return out;
}

export const linksOf = (s: DbSchema): Link[] => [...declaredLinks(s), ...inferredLinks(s)];

/** The tables directly linked to `key`, in either direction, and itself. */
export function neighborhood(key: string, links: Link[]): Set<string> {
  const out = new Set([key]);
  for (const l of links) {
    if (l.from === key) out.add(l.to);
    if (l.to === key) out.add(l.from);
  }
  return out;
}

export interface NamedSchema {
  id: string;
  label: string;
  schema: DbSchema;
}

/** References between databases, as microservices keep them: `chat.messages.
 * user_id` with no `users` table of its own, while another database has one.
 * Always guesses — no database can declare a key into another. */
export function crossDbLinks(dbs: NamedSchema[]): Link[] {
  const out: Link[] = [];
  for (const a of dbs) {
    for (const t of a.schema.tables) {
      for (const c of t.columns) {
        if (c.isPrimary) continue;
        const base = referencedName(c.name);
        if (!base) continue;
        if (a.schema.tables.some((x) => nameMatches(base, x.name))) continue;
        const hits = dbs
          .filter((b) => b.id !== a.id)
          .flatMap((b) =>
            b.schema.tables
              .filter((x) => nameMatches(base, x.name) && primaryColumn(x))
              .map((x) => ({ b, x })),
          );
        if (hits.length !== 1) continue;
        const { b, x } = hits[0];
        out.push({
          id: `cross:${a.id}:${keyOf(t)}.${c.name}`,
          name: `${c.name} → ${b.label}.${x.name}`,
          from: keyOf(t),
          fromColumns: [c.name],
          to: keyOf(x),
          toColumns: [primaryColumn(x)!],
          inferred: true,
          onDelete: null,
          fromDb: a.id,
          toDb: b.id,
        });
      }
    }
  }
  return out;
}

/** For a table: what it points at and what points at it, per column. */
export function columnRefs(key: string, links: Link[]) {
  const outgoing = new Map<string, Link>();
  for (const l of links) if (l.from === key) for (const c of l.fromColumns) outgoing.set(c, l);
  const incoming = links.filter((l) => l.to === key);
  return { outgoing, incoming };
}

/** Foreign keys from `table` whose columns don't lead any index: joins and
 * deletes on the parent then scan this whole table. */
export function unindexedForeignKeys(table: TableInfo, links: Link[]): Link[] {
  const key = keyOf(table);
  return links.filter(
    (l) =>
      l.from === key &&
      !l.inferred &&
      !table.indexes.some((i) => l.fromColumns.every((c, n) => i.columns[n] === c)),
  );
}

/** Real tables (not views or collections) with no primary key. */
export const tablesWithoutPrimaryKey = (s: DbSchema) =>
  s.tables.filter((t) => t.kind === 'table' && !t.columns.some((c) => c.isPrimary));
