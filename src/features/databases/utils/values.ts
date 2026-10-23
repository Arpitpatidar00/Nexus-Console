/** What a value in a row or document is, for colouring and editing hints.
 * MongoDB values arrive as relaxed EJSON (`{ $oid }`, `{ $date }`…). */
export type ValueKind =
  'null' | 'string' | 'number' | 'boolean' | 'objectId' | 'date' | 'array' | 'object';

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function kindOf(v: unknown): ValueKind {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return 'array';
  if (isObj(v)) {
    if (typeof v.$oid === 'string') return 'objectId';
    if (v.$date !== undefined) return 'date';
    if (
      v.$numberLong !== undefined ||
      v.$numberDecimal !== undefined ||
      v.$numberDouble !== undefined
    )
      return 'number';
    return 'object';
  }
  if (typeof v === 'number' || typeof v === 'bigint') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v)) return 'date';
  return 'string';
}

/** The scalar inside an EJSON wrapper, as text. */
export function scalarText(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (isObj(v)) {
    if (typeof v.$oid === 'string') return v.$oid;
    if (v.$date !== undefined) {
      const d = v.$date;
      return typeof d === 'string'
        ? d
        : isObj(d) && typeof d.$numberLong === 'string'
          ? new Date(Number(d.$numberLong)).toISOString()
          : String(d);
    }
    for (const k of ['$numberLong', '$numberDecimal', '$numberDouble'])
      if (v[k] !== undefined) return String(v[k]);
  }
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

/** One line, at most `max` characters, for grids and collapsed documents. */
export function preview(v: unknown, max = 80): string {
  const k = kindOf(v);
  let s: string;
  if (k === 'array')
    s = `[${(v as unknown[]).length} item${(v as unknown[]).length === 1 ? '' : 's'}]`;
  else if (k === 'object')
    s = `{${Object.keys(v as object).length} field${Object.keys(v as object).length === 1 ? '' : 's'}}`;
  else s = scalarText(v).replace(/\s+/g, ' ');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Text a filter can match: what someone would type to find this value. */
export const filterText = (v: unknown) => scalarText(v);

/** Values worth expanding: objects and non-empty arrays. */
export const isNested = (v: unknown) =>
  (Array.isArray(v) && v.length > 0) ||
  (isObj(v) && kindOf(v) === 'object' && Object.keys(v).length > 0);

export const entriesOf = (v: unknown): [string, unknown][] =>
  Array.isArray(v) ? v.map((x, i) => [String(i), x]) : isObj(v) ? Object.entries(v) : [];
