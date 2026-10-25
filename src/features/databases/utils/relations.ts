import type { DbSchema, TableInfo } from '@/features/databases/api/explorer.schema';
import type {
  DbCustomMapping,
  DbRejectedCandidate,
} from '@/features/databases/api/databases.schema';

export const tableKey = (schema: string, name: string) => `${schema}.${name}`;
export const keyOf = (t: Pick<TableInfo, 'schema' | 'name'>) => tableKey(t.schema, t.name);

export type RelationProvenance = 'declared' | 'inferred' | 'configured';

export type RelationStatus = 'active' | 'ambiguous' | 'incompatible' | 'rejected' | 'stale';

export type TypeCompatibility = 'compatible' | 'incompatible' | 'unknown';

export interface RelationCandidate {
  targetDb: string;
  targetDbLabel: string;
  targetTable: string;
  targetColumn: string;
  targetDataType?: string;
  compatibility: TypeCompatibility;
  reason: string;
}

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
  provenance: RelationProvenance;
  status: RelationStatus;
  compatibility?: TypeCompatibility;
  compatibilityReason?: string;
  candidates?: RelationCandidate[];
  mappingId?: string;
  notes?: string;
}

export function classifyTypeCompatibility(
  sourceType?: string | null,
  targetType?: string | null,
): { compatibility: TypeCompatibility; reason: string } {
  if (!sourceType || !targetType) {
    return {
      compatibility: 'unknown',
      reason: 'Type information is missing or sampled',
    };
  }

  const s = sourceType
    .toLowerCase()
    .replace(/\(.*\)/, '')
    .trim();
  const t = targetType
    .toLowerCase()
    .replace(/\(.*\)/, '')
    .trim();

  if (s === t) {
    return { compatibility: 'compatible', reason: `Exact type match: ${s}` };
  }

  const isInt = (type: string) =>
    [
      'int',
      'integer',
      'int2',
      'int4',
      'int8',
      'bigint',
      'smallint',
      'tinyint',
      'serial',
      'bigserial',
      'number',
    ].includes(type);
  const isText = (type: string) =>
    ['varchar', 'char', 'character varying', 'text', 'string', 'clob'].includes(type);
  const isUuid = (type: string) => type === 'uuid';
  const isOid = (type: string) => ['objectid', 'object_id', 'oid'].includes(type);
  const isDate = (type: string) =>
    ['timestamp', 'timestamptz', 'date', 'datetime', 'time'].includes(type);
  const isBool = (type: string) => ['bool', 'boolean'].includes(type);

  if (isInt(s) && isInt(t)) {
    return { compatibility: 'compatible', reason: 'Both fields are numeric integers' };
  }
  if (isText(s) && isText(t)) {
    return { compatibility: 'compatible', reason: 'Both fields are string / text types' };
  }
  if (isUuid(s) && isUuid(t)) {
    return { compatibility: 'compatible', reason: 'Both fields are UUIDs' };
  }
  if (isOid(s) && isOid(t)) {
    return { compatibility: 'compatible', reason: 'Both fields are BSON ObjectIds' };
  }

  // Cross-category compatibility:
  if ((isUuid(s) && isText(t)) || (isText(s) && isUuid(t))) {
    return { compatibility: 'compatible', reason: 'UUID and string identifiers can map safely' };
  }
  if ((isText(s) && isOid(t)) || (isOid(s) && isText(t))) {
    return {
      compatibility: 'compatible',
      reason: 'Hexadecimal string can map to BSON ObjectId when formatted as 24-char hex',
    };
  }

  // Definite incompatibilities:
  if ((isInt(s) && isOid(t)) || (isOid(s) && isInt(t))) {
    return {
      compatibility: 'incompatible',
      reason: 'Numeric integer cannot map to 24-character BSON ObjectId',
    };
  }
  if ((isInt(s) && isUuid(t)) || (isUuid(s) && isInt(t))) {
    return {
      compatibility: 'incompatible',
      reason: 'Numeric integer cannot map to 128-bit UUID format',
    };
  }
  if (isBool(s) !== isBool(t) && (isBool(s) || isBool(t))) {
    return {
      compatibility: 'incompatible',
      reason: 'Boolean flag is incompatible with non-boolean target',
    };
  }
  if (isDate(s) !== isDate(t) && (isDate(s) || isDate(t))) {
    return {
      compatibility: 'incompatible',
      reason: 'Date/time timestamp is incompatible with non-temporal target',
    };
  }

  return {
    compatibility: 'unknown',
    reason: `Compatibility between ${sourceType} and ${targetType} cannot be automatically confirmed`,
  };
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
    provenance: 'declared',
    status: 'active',
    compatibility: 'compatible',
    compatibilityReason: 'Database-enforced foreign key constraint',
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
export function nameMatches(base: string, table: string): boolean {
  const b = norm(base);
  const t = norm(table);
  return (
    t === b || t === `${b}s` || t === `${b}es` || (b.endsWith('y') && t === `${b.slice(0, -1)}ies`)
  );
}

export const primaryColumn = (t: TableInfo) =>
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
      const targetPk = primaryColumn(target)!;
      const targetCol = target.columns.find((col) => col.name === targetPk);
      const { compatibility, reason } = classifyTypeCompatibility(c.dataType, targetCol?.dataType);

      out.push({
        id: `guess:${keyOf(t)}.${c.name}`,
        name: `${c.name} → ${target.name}`,
        from: keyOf(t),
        fromColumns: [c.name],
        to: keyOf(target),
        toColumns: [targetPk],
        inferred: true,
        onDelete: null,
        provenance: 'inferred',
        status: compatibility === 'incompatible' ? 'incompatible' : 'active',
        compatibility,
        compatibilityReason: reason,
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

export interface CrossDbOptions {
  customMappings?: DbCustomMapping[];
  rejectedCandidates?: DbRejectedCandidate[];
}

/**
 * References between databases in a microservices workspace.
 * Resolves declared, configured, and inferred links.
 * Detects ambiguity when multiple viable candidate targets exist instead of silently discarding.
 */
export function crossDbLinks(dbs: NamedSchema[], options?: CrossDbOptions): Link[] {
  const out: Link[] = [];
  const rejectedSet = new Set<string>();

  for (const r of options?.rejectedCandidates ?? []) {
    rejectedSet.add(
      `${r.sourceConnectionId}:${r.sourceTable}:${r.sourceColumn}::${r.targetConnectionId}:${r.targetTable}:${r.targetColumn}`,
    );
  }

  // 1. Process persisted user-configured mappings
  const configuredSources = new Set<string>();
  for (const m of options?.customMappings ?? []) {
    const srcDb = dbs.find((d) => d.id === m.sourceConnectionId);
    const tgtDb = dbs.find((d) => d.id === m.targetConnectionId);
    const srcTable = srcDb?.schema.tables.find(
      (t) => t.schema === m.sourceSchema && t.name === m.sourceTable,
    );
    const tgtTable = tgtDb?.schema.tables.find(
      (t) => t.schema === m.targetSchema && t.name === m.targetTable,
    );
    const srcCol = srcTable?.columns.find((c) => c.name === m.sourceColumn);
    const tgtCol = tgtTable?.columns.find((c) => c.name === m.targetColumn);

    configuredSources.add(
      `${m.sourceConnectionId}:${m.sourceSchema}.${m.sourceTable}:${m.sourceColumn}`,
    );

    if (!srcDb || !tgtDb || !srcTable || !tgtTable || !srcCol || !tgtCol) {
      // Stale or unresolved mapping
      out.push({
        id: `custom:${m.id}`,
        name: `${m.sourceColumn} → ${m.targetTable}.${m.targetColumn} (unresolved)`,
        from: `${m.sourceSchema}.${m.sourceTable}`,
        fromColumns: [m.sourceColumn],
        to: `${m.targetSchema}.${m.targetTable}`,
        toColumns: [m.targetColumn],
        inferred: false,
        provenance: 'configured',
        status: 'stale',
        onDelete: null,
        fromDb: m.sourceConnectionId,
        toDb: m.targetConnectionId,
        mappingId: m.id,
        notes: m.notes ?? undefined,
        compatibility: 'unknown',
        compatibilityReason:
          'Saved mapping target connection, table, or column could not be resolved in the active schema',
      });
    } else {
      const { compatibility, reason } = classifyTypeCompatibility(srcCol.dataType, tgtCol.dataType);
      out.push({
        id: `custom:${m.id}`,
        name: `${m.sourceColumn} → ${tgtDb.label}.${tgtTable.name}`,
        from: keyOf(srcTable),
        fromColumns: [m.sourceColumn],
        to: keyOf(tgtTable),
        toColumns: [m.targetColumn],
        inferred: false,
        provenance: 'configured',
        status: 'active',
        onDelete: null,
        fromDb: m.sourceConnectionId,
        toDb: m.targetConnectionId,
        mappingId: m.id,
        notes: m.notes ?? undefined,
        compatibility,
        compatibilityReason: reason,
      });
    }
  }

  // 2. Discover heuristic candidates across connections
  for (const a of dbs) {
    for (const t of a.schema.tables) {
      for (const c of t.columns) {
        if (c.isPrimary) continue;
        const sourceKey = `${a.id}:${keyOf(t)}:${c.name}`;
        if (configuredSources.has(sourceKey)) continue;

        const base = referencedName(c.name);
        if (!base) continue;

        // Search viable targets in other databases in the workspace
        const hits = dbs
          .filter((b) => b.id !== a.id)
          .flatMap((b) =>
            b.schema.tables
              .filter((x) => nameMatches(base, x.name) && primaryColumn(x))
              .map((x) => ({ b, x })),
          );

        // Filter out candidates previously rejected by the user
        const validHits = hits.filter(({ b, x }) => {
          const pk = primaryColumn(x)!;
          return !rejectedSet.has(`${a.id}:${t.name}:${c.name}::${b.id}:${x.name}:${pk}`);
        });

        if (validHits.length === 0) continue;

        if (validHits.length === 1) {
          const { b, x } = validHits[0];
          const pk = primaryColumn(x)!;
          const targetCol = x.columns.find((col) => col.name === pk);
          const { compatibility, reason } = classifyTypeCompatibility(
            c.dataType,
            targetCol?.dataType,
          );

          out.push({
            id: `cross:${a.id}:${keyOf(t)}.${c.name}`,
            name: `${c.name} → ${b.label}.${x.name}`,
            from: keyOf(t),
            fromColumns: [c.name],
            to: keyOf(x),
            toColumns: [pk],
            inferred: true,
            provenance: 'inferred',
            status: compatibility === 'incompatible' ? 'incompatible' : 'active',
            onDelete: null,
            fromDb: a.id,
            toDb: b.id,
            compatibility,
            compatibilityReason: reason,
          });
        } else {
          // Ambiguous: multiple targets found. DO NOT silently discard! (ISS-01 fix)
          const candidates: RelationCandidate[] = validHits.map(({ b, x }) => {
            const pk = primaryColumn(x)!;
            const targetCol = x.columns.find((col) => col.name === pk);
            const { compatibility, reason } = classifyTypeCompatibility(
              c.dataType,
              targetCol?.dataType,
            );
            return {
              targetDb: b.id,
              targetDbLabel: b.label,
              targetTable: keyOf(x),
              targetColumn: pk,
              targetDataType: targetCol?.dataType,
              compatibility,
              reason,
            };
          });

          out.push({
            id: `cross:ambig:${a.id}:${keyOf(t)}.${c.name}`,
            name: `${c.name} → [${validHits.length} candidates]`,
            from: keyOf(t),
            fromColumns: [c.name],
            to: keyOf(validHits[0].x),
            toColumns: [primaryColumn(validHits[0].x)!],
            inferred: true,
            provenance: 'inferred',
            status: 'ambiguous',
            onDelete: null,
            fromDb: a.id,
            toDb: validHits[0].b.id,
            candidates,
            compatibility: candidates.some((cand) => cand.compatibility === 'compatible')
              ? 'compatible'
              : 'unknown',
            compatibilityReason: `Ambiguous candidate set: ${validHits.length} matching targets found`,
          });
        }
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
