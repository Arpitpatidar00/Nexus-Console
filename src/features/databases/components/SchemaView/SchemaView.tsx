import { ArrowRight, CornerDownRight } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { TableInfo } from '@/features/databases/api/explorer.schema';
import { columnRefs, keyOf, type Link } from '@/features/databases/utils/relations';
import type { OpenTable } from '@/features/databases/components/DocumentCard';

interface Props {
  table: TableInfo;
  links: Link[];
  nameOf: (key: string) => string;
  onOpenTable: OpenTable;
}

const Key = ({ k }: { k: 'PK' | 'FK' | 'UK' }) => (
  <span
    className={cn(
      'rounded px-1 text-[10px] font-bold',
      k === 'PK'
        ? 'bg-warning-soft text-warning'
        : k === 'FK'
          ? 'bg-info-soft text-info'
          : 'bg-muted text-muted-foreground',
    )}
    title={k === 'PK' ? 'Primary key' : k === 'FK' ? 'Foreign key' : 'Unique'}
  >
    {k}
  </span>
);

/** Every column with what it holds and what it connects to — the questions
 * pgAdmin answers across five dialogs, on one page. */
export const SchemaView = ({ table, links, nameOf, onOpenTable }: Props) => {
  const { outgoing, incoming } = columnRefs(keyOf(table), links);
  const sampled = table.columns.some((c) => c.presence != null);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="px-4 py-3">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="border-b border-hairline py-2 pr-3 font-medium">Column</th>
              <th className="border-b border-hairline py-2 pr-3 font-medium">Type</th>
              <th className="border-b border-hairline py-2 pr-3 font-medium">
                {sampled ? 'In sampled documents' : 'Required'}
              </th>
              <th className="border-b border-hairline py-2 pr-3 font-medium">Default</th>
              <th className="border-b border-hairline py-2 font-medium">Points to</th>
            </tr>
          </thead>
          <tbody>
            {table.columns.map((c) => {
              const l = outgoing.get(c.name);
              return (
                <tr key={c.name} className="align-top">
                  <td className="border-b border-hairline py-2 pr-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-fg">{c.name}</span>
                      {c.isPrimary && <Key k="PK" />}
                      {l && <Key k="FK" />}
                      {c.isUnique && !c.isPrimary && <Key k="UK" />}
                    </div>
                    {c.comment && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{c.comment}</p>
                    )}
                  </td>
                  <td className="border-b border-hairline py-2 pr-3 font-mono text-xs text-muted-foreground">
                    {c.dataType}
                  </td>
                  <td className="border-b border-hairline py-2 pr-3 text-xs">
                    {c.presence != null ? (
                      <span
                        className="flex items-center gap-2"
                        title={`${Math.round(c.presence * 100)}% of sampled documents`}
                      >
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full bg-ember"
                            style={{ width: `${c.presence * 100}%` }}
                          />
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {Math.round(c.presence * 100)}%
                        </span>
                      </span>
                    ) : c.nullable ? (
                      <span className="text-muted-foreground">optional</span>
                    ) : (
                      <span className="text-fg">required</span>
                    )}
                  </td>
                  <td
                    className="max-w-48 truncate border-b border-hairline py-2 pr-3 font-mono text-xs text-muted-foreground"
                    title={c.default ?? undefined}
                  >
                    {c.default ?? ''}
                  </td>
                  <td className="border-b border-hairline py-2 text-xs">
                    {l && (
                      <button
                        type="button"
                        onClick={() => onOpenTable(l.to)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded px-1 text-info hover:bg-info-soft"
                        title={
                          l.inferred
                            ? 'Guessed from the column name — no foreign key declares it'
                            : `${l.name}${l.onDelete ? ` · on delete ${l.onDelete}` : ''}`
                        }
                      >
                        <ArrowRight className="size-3" aria-hidden />
                        {nameOf(l.to)}.
                        {l.toColumns[l.fromColumns.indexOf(c.name)] ?? l.toColumns[0]}
                        {l.inferred && <span className="text-muted-foreground">(guess)</span>}
                      </button>
                    )}
                    {l && !l.inferred && l.onDelete && l.onDelete !== 'no action' && (
                      <span className="ml-1 text-muted-foreground">on delete {l.onDelete}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sampled && (
          <p className="mt-2 text-xs text-muted-foreground">
            MongoDB has no fixed schema: fields and types come from a random sample of up to 200
            documents.
          </p>
        )}
      </div>
      {incoming.length > 0 && (
        <section className="border-t border-hairline px-4 py-3">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-fg">
            <CornerDownRight className="size-4 text-muted-foreground" aria-hidden />
            Referenced by
          </h3>
          <ul className="flex flex-col gap-1">
            {incoming.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => onOpenTable(l.from)}
                  className="cursor-pointer font-mono text-info hover:underline"
                >
                  {nameOf(l.from)}.{l.fromColumns.join(', ')}
                </button>
                <span className="text-muted-foreground">
                  → {l.toColumns.join(', ')}
                  {l.inferred
                    ? ' · guessed from names'
                    : l.onDelete && l.onDelete !== 'no action'
                      ? ` · deleting a row here ${l.onDelete === 'cascade' ? 'deletes' : l.onDelete === 'set null' ? 'clears' : 'is blocked by'} those rows`
                      : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
