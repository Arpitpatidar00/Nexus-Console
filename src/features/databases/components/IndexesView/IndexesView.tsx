import { Gauge } from 'lucide-react';
import type { TableInfo } from '@/features/databases/api/explorer.schema';
import { unindexedForeignKeys, type Link } from '@/features/databases/utils/relations';

/** The table's indexes, and the foreign keys that have none (a common reason
 * joins and parent deletes are slow). */
export const IndexesView = ({
  table,
  links,
  nameOf,
}: {
  table: TableInfo;
  links: Link[];
  nameOf: (key: string) => string;
}) => {
  const missing = unindexedForeignKeys(table, links);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      {table.indexes.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          {table.kind === 'view'
            ? 'Views have no indexes of their own.'
            : 'No indexes on this table.'}
        </p>
      ) : (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline">
          {table.indexes.map((i) => (
            <li key={i.name} className="px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-foreground">{i.name}</span>
                {i.primary ? (
                  <span className="rounded bg-warning-soft px-1.5 text-[11px] font-medium text-warning">
                    primary key
                  </span>
                ) : (
                  i.unique && (
                    <span className="rounded bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">
                      unique
                    </span>
                  )
                )}
                {i.method && <span className="text-xs text-muted-foreground">{i.method}</span>}
                <span className="flex flex-wrap gap-1">
                  {i.columns.map((c, n) => (
                    <span
                      key={n}
                      className="rounded-full border border-hairline px-2 font-mono text-xs text-foreground"
                    >
                      {c}
                    </span>
                  ))}
                </span>
              </div>
              {i.definition && (
                <p
                  className="mt-1 truncate font-mono text-xs text-muted-foreground"
                  title={i.definition}
                >
                  {i.definition}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {missing.length > 0 && (
        <section className="mt-4 rounded-lg border border-hairline px-3 py-2.5">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Gauge className="size-4 text-warning" aria-hidden />
            Foreign keys without an index
            <span className="rounded bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">
              Speed
            </span>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Joining on these, or deleting and updating the rows they point to, has to scan this
            whole table. Not a problem while it's small.
          </p>
          <ul className="mt-2 space-y-1">
            {missing.map((l) => (
              <li key={l.id} className="font-mono text-xs text-foreground">
                {l.fromColumns.join(', ')} → {nameOf(l.to)}
                <span className="ml-2 text-muted-foreground select-all">
                  CREATE INDEX ON {table.schema}.{table.name} ({l.fromColumns.join(', ')});
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
