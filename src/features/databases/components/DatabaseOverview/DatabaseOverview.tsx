import { useState } from 'react';
import { Gauge, Info, KeyRound, Search } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatBytes } from '@/shared/lib/format';
import type { DbSchema, TableInfo } from '@/features/databases/api/explorer.schema';
import {
  inferredLinks,
  keyOf,
  tablesWithoutPrimaryKey,
  unindexedForeignKeys,
  type Link,
} from '@/features/databases/utils/relations';
import type { OpenTable } from '@/features/databases/components/DocumentCard';

type SortKey = 'name' | 'rows' | 'size' | 'columns' | 'links';

const ENGINE: Record<string, string> = {
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  mongodb: 'MongoDB',
  mongo: 'MongoDB',
  redis: 'Redis',
};

interface Props {
  schema: DbSchema;
  links: Link[];
  onOpenTable: OpenTable;
}

/** What's in this database at a glance — and the few things worth a look —
 * before any table is opened. */
export const DatabaseOverview = ({ schema: s, links, onOpenTable }: Props) => {
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'name', desc: false });
  const linkCount = (t: TableInfo) =>
    links.filter((l) => l.from === keyOf(t) || l.to === keyOf(t)).length;
  const value = (t: TableInfo, k: SortKey): number | string =>
    k === 'name'
      ? t.name
      : k === 'rows'
        ? (t.rowEstimate ?? -1)
        : k === 'size'
          ? (t.sizeBytes ?? -1)
          : k === 'columns'
            ? t.columns.length
            : linkCount(t);
  const q = filter.trim().toLowerCase();
  const tables = s.tables
    .filter((t) => !q || keyOf(t).toLowerCase().includes(q))
    .sort((a, b) => {
      const x = value(a, sort.key);
      const y = value(b, sort.key);
      const c = typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number);
      return sort.desc ? -c : c;
    });

  const isRedis = s.engine === 'redis';
  const views = s.tables.filter(
    (t) => t.kind !== 'table' && t.kind !== 'collection' && t.kind !== 'keyspace',
  ).length;
  const noPk = isRedis || s.engine.startsWith('mongo') ? [] : tablesWithoutPrimaryKey(s);
  const unindexed = s.tables.flatMap((t) => unindexedForeignKeys(t, links));
  const guessed = inferredLinks(s);
  const multi = s.schemas.length > 1;

  const th = (k: SortKey, label: string, right = false) => (
    <th className={cn('border-b border-hairline px-3 py-2 font-medium', right && 'text-right')}>
      <button
        type="button"
        onClick={() => setSort((x) => ({ key: k, desc: x.key === k ? !x.desc : k !== 'name' }))}
        className="cursor-pointer hover:text-fg"
      >
        {label}
        {sort.key === k && (sort.desc ? ' ↓' : ' ↑')}
      </button>
    </th>
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <p className="border-b border-hairline px-4 py-3 text-sm text-muted-foreground tabular-nums">
        <span className="text-fg">{ENGINE[s.engine] ?? s.engine}</span>
        {s.serverVersion && ` ${s.serverVersion.split(' ')[0]}`}
        {s.sizeBytes != null && ` · ${formatBytes(s.sizeBytes)}`}
        {multi && ` · ${s.schemas.length} schemas`}
        {` · ${s.tables.length - views} ${isRedis ? 'key prefixes' : s.engine.startsWith('mongo') ? 'collections' : 'tables'}`}
        {views > 0 && ` · ${views} view${views === 1 ? '' : 's'}`}
        {!isRedis && ` · ${s.relations.length} foreign key${s.relations.length === 1 ? '' : 's'}`}
      </p>

      {(noPk.length > 0 || unindexed.length > 0 || guessed.length > 0) && (
        <section className="border-b border-hairline px-4 py-3">
          <h3 className="mb-2 text-sm font-semibold text-fg">Worth a look</h3>
          <ul className="space-y-2 text-sm">
            {noPk.length > 0 && (
              <li className="flex gap-2">
                <KeyRound className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <span>
                  <span className="text-fg">
                    {noPk.length} table{noPk.length === 1 ? ' has' : 's have'} no primary key
                  </span>
                  <span className="text-muted-foreground">
                    {' '}
                    — rows can't be told apart reliably, and most ORMs and replication need
                    one:{' '}
                  </span>
                  {noPk.slice(0, 6).map((t, i) => (
                    <button
                      key={keyOf(t)}
                      type="button"
                      onClick={() => onOpenTable(keyOf(t))}
                      className="cursor-pointer font-mono text-xs text-info hover:underline"
                    >
                      {i > 0 && ', '}
                      {t.name}
                    </button>
                  ))}
                </span>
              </li>
            )}
            {unindexed.length > 0 && (
              <li className="flex gap-2">
                <Gauge className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <span>
                  <span className="text-fg">
                    {unindexed.length} foreign key{unindexed.length === 1 ? ' has' : 's have'} no
                    index
                  </span>
                  <span className="text-muted-foreground">
                    {' '}
                    — joins and parent deletes scan the child table (Speed):{' '}
                  </span>
                  {unindexed.slice(0, 6).map((l, i) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => onOpenTable(l.from)}
                      className="cursor-pointer font-mono text-xs text-info hover:underline"
                    >
                      {i > 0 && ', '}
                      {l.from.split('.').pop()}.{l.fromColumns.join('+')}
                    </button>
                  ))}
                  {unindexed.length > 6 && (
                    <span className="text-muted-foreground"> and {unindexed.length - 6} more</span>
                  )}
                </span>
              </li>
            )}
            {guessed.length > 0 && (
              <li className="flex gap-2">
                <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
                <span>
                  <span className="text-fg">
                    {guessed.length} column{guessed.length === 1 ? ' looks' : 's look'} like a
                    reference without a foreign key
                  </span>
                  <span className="text-muted-foreground">
                    {' '}
                    — shown dashed in diagrams. The database won't stop them pointing at rows that
                    don't exist (Info).
                  </span>
                </span>
              </li>
            )}
          </ul>
        </section>
      )}

      <div className="px-4 py-3">
        <label className="mb-2 flex h-8 max-w-sm items-center gap-2 rounded-full border border-hairline bg-muted px-3 focus-within:ring-2 focus-within:ring-ring">
          <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Filter ${s.tables.length} ${isRedis ? 'prefixes' : 'tables'}`}
            aria-label="Filter tables"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-muted-foreground"
          />
        </label>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              {th('name', 'Name')}
              {th('rows', isRedis ? 'Keys' : 'Rows (≈)', true)}
              {th('size', 'Size', true)}
              {th('columns', s.engine.startsWith('mongo') ? 'Fields' : 'Columns', true)}
              {!isRedis && th('links', 'Links', true)}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {tables.map((t) => (
              <tr
                key={keyOf(t)}
                onClick={() => onOpenTable(keyOf(t))}
                className="cursor-pointer hover:bg-accent"
              >
                <td className="border-b border-hairline px-3 py-2">
                  <span
                    className={cn(
                      'font-mono text-fg',
                      t.kind !== 'table' &&
                        t.kind !== 'collection' &&
                        t.kind !== 'keyspace' &&
                        'italic',
                    )}
                  >
                    {multi && <span className="text-muted-foreground">{t.schema}.</span>}
                    {t.name}
                  </span>
                  {t.kind !== 'table' && t.kind !== 'collection' && t.kind !== 'keyspace' && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t.kind === 'materializedView' ? 'materialized view' : t.kind}
                    </span>
                  )}
                  {t.comment && (
                    <span className="ml-2 text-xs text-muted-foreground">{t.comment}</span>
                  )}
                </td>
                <td className="border-b border-hairline px-3 py-2 text-right text-muted-foreground">
                  {t.rowEstimate == null ? '—' : t.rowEstimate.toLocaleString()}
                </td>
                <td className="border-b border-hairline px-3 py-2 text-right text-muted-foreground">
                  {t.sizeBytes == null ? '—' : formatBytes(t.sizeBytes)}
                </td>
                <td className="border-b border-hairline px-3 py-2 text-right text-muted-foreground">
                  {t.columns.length}
                </td>
                {!isRedis && (
                  <td className="border-b border-hairline px-3 py-2 text-right text-muted-foreground">
                    {linkCount(t) || ''}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
