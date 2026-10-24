import { useState } from 'react';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCw,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/Button';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import {
  FILTER_OPS,
  type BrowseRequest,
  type Filter,
  type FilterOp,
  type TableInfo,
} from '@/features/databases/api/explorer.schema';
import { useBrowse } from '@/features/databases/api/useExplorer';
import { columnRefs, keyOf, type Link } from '@/features/databases/utils/relations';
import { kindOf, preview } from '@/features/databases/utils/values';
import {
  DocumentCard,
  KIND_CLS,
  type OpenTable,
} from '@/features/databases/components/DocumentCard';

const OP_LABEL: Record<FilterOp, string> = {
  eq: '=',
  neq: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  contains: 'contains',
  startsWith: 'starts with',
  isNull: 'is empty',
  notNull: 'has a value',
};
const PAGE_SIZES = [20, 50, 100, 200];
const needsValue = (op: FilterOp) => op !== 'isNull' && op !== 'notNull';

type Mode = 'documents' | 'table';

interface Query {
  filters: Filter[];
  search: string;
  sort: { column: string; desc: boolean } | null;
  limit: number;
  page: number;
}

interface Props {
  connectionId: string;
  engine: string;
  table: TableInfo;
  links: Link[];
  nameOf: (key: string) => string;
  onOpenTable: OpenTable;
  /** Arriving from a link: start filtered to the row(s) it points at. */
  initialFilter?: Filter;
}

const selectCls =
  'h-8 cursor-pointer rounded-full border border-hairline bg-muted px-2.5 text-[13px] text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Browse a table like Compass browses a collection: a query bar of plain
 * filters (no SQL), documents or a grid, and pages that say how many match. */
export const DocumentsView = ({
  connectionId,
  engine,
  table,
  links,
  nameOf,
  onOpenTable,
  initialFilter,
}: Props) => {
  const isRedis = engine === 'redis';
  const isMongo = engine === 'mongo' || engine === 'mongodb';
  // Mongo fields include nested paths (a.b); the grid shows top-level ones.
  const columns = table.columns.map((c) => c.name);
  const topLevel = columns.filter((c) => !c.includes('.'));
  const pk = table.columns.find((c) => c.isPrimary)?.name ?? null;
  const defaultSort = isRedis || !pk ? null : { column: pk, desc: false };

  const [mode, setMode] = useState<Mode>(isMongo || isRedis ? 'documents' : 'table');
  const [query, setQuery] = useState<Query>({
    filters: initialFilter ? [initialFilter] : [],
    search: '',
    sort: defaultSort,
    limit: 20,
    page: 0,
  });
  const [draft, setDraft] = useState<Filter[]>(query.filters);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number | null>(null);

  const request: BrowseRequest = {
    schema: table.schema,
    table: table.name,
    columns: isMongo ? topLevel : columns,
    filters: query.filters,
    search: query.search || undefined,
    sort: query.sort ?? undefined,
    limit: query.limit,
    offset: query.page * query.limit,
  };
  const page = useBrowse(connectionId, request);
  const rows = (page.data?.rows ?? []) as Record<string, unknown>[];
  const total = page.data?.total ?? null;
  const from = query.page * query.limit;
  const { outgoing, incoming } = columnRefs(keyOf(table), links);

  const apply = (patch: Partial<Query> = {}) => {
    const filters = draft.filter((f) => f.column && (!needsValue(f.op) || (f.value ?? '') !== ''));
    setDraft(filters);
    setSelected(null);
    setQuery((q) => ({ ...q, filters, search: search.trim(), page: 0, ...patch }));
  };
  const reset = () => {
    setDraft([]);
    setSearch('');
    setSelected(null);
    setQuery({ filters: [], search: '', sort: defaultSort, limit: query.limit, page: 0 });
  };
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(query.filters) || search.trim() !== query.search;
  const editFilter = (i: number, patch: Partial<Filter>) =>
    setDraft((d) => d.map((f, n) => (n === i ? { ...f, ...patch } : f)));

  const gridCols = isMongo ? topLevel : columns;
  const card = (row: Record<string, unknown>, className?: string) => (
    <DocumentCard
      row={row}
      order={columns}
      outgoing={outgoing}
      incoming={incoming}
      nameOf={nameOf}
      onOpenTable={onOpenTable}
      className={className}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Query bar */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-hairline px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-8 min-w-48 flex-1 items-center gap-2 rounded-full border border-hairline bg-muted px-3 focus-within:ring-2 focus-within:ring-ring">
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
              placeholder={isRedis ? 'Keys containing…' : 'Search every column…'}
              aria-label="Search"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-muted-foreground"
            />
          </label>
          {!isRedis && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setDraft((d) => [...d, { column: columns[0] ?? '', op: 'eq', value: '' }])
              }
            >
              <Plus />
              Filter
            </Button>
          )}
          {!isRedis && (
            <span className="flex items-center gap-1">
              <select
                aria-label="Sort by"
                value={query.sort?.column ?? ''}
                onChange={(e) =>
                  apply({
                    sort: e.target.value
                      ? { column: e.target.value, desc: query.sort?.desc ?? false }
                      : null,
                  })
                }
                className={selectCls}
              >
                <option value="">Unsorted</option>
                {(isMongo ? topLevel : columns).map((c) => (
                  <option key={c} value={c}>
                    Sort: {c}
                  </option>
                ))}
              </select>
              {query.sort && (
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label={query.sort.desc ? 'Descending' : 'Ascending'}
                  title={query.sort.desc ? 'Newest/largest first' : 'Oldest/smallest first'}
                  onClick={() => apply({ sort: { ...query.sort!, desc: !query.sort!.desc } })}
                >
                  {query.sort.desc ? <ArrowDownWideNarrow /> : <ArrowUpNarrowWide />}
                </Button>
              )}
            </span>
          )}
          <Button variant={dirty ? 'ember' : 'outline'} size="sm" onClick={() => apply()}>
            Find
          </Button>
          {(query.filters.length > 0 || query.search || draft.length > 0) && (
            <Button variant="ghost" size="sm" onClick={reset}>
              Reset
            </Button>
          )}
          <span className="ml-auto flex items-center gap-2">
            <SegmentedControl<Mode>
              ariaLabel="View"
              value={mode}
              onChange={(m) => {
                setMode(m);
                setSelected(null);
              }}
              options={[
                { value: 'documents', label: 'Documents' },
                { value: 'table', label: 'Table' },
              ]}
            />
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Reload"
              title="Reload"
              disabled={page.isFetching}
              onClick={() => void page.refetch()}
            >
              <RotateCw
                className={cn(page.isFetching && 'animate-spin motion-reduce:animate-none')}
              />
            </Button>
          </span>
        </div>
        {draft.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {draft.map((f, i) => (
              <li key={i} className="flex flex-wrap items-center gap-1.5">
                <span className="w-10 text-right text-xs text-muted-foreground">
                  {i === 0 ? 'where' : 'and'}
                </span>
                <select
                  aria-label="Column"
                  value={f.column}
                  onChange={(e) => editFilter(i, { column: e.target.value })}
                  className={cn(selectCls, 'font-mono')}
                >
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Condition"
                  value={f.op}
                  onChange={(e) => editFilter(i, { op: e.target.value as FilterOp })}
                  className={selectCls}
                >
                  {FILTER_OPS.map((op) => (
                    <option key={op} value={op}>
                      {OP_LABEL[op]}
                    </option>
                  ))}
                </select>
                {needsValue(f.op) && (
                  <input
                    value={f.value ?? ''}
                    onChange={(e) => editFilter(i, { value: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && apply()}
                    placeholder="value"
                    aria-label="Value"
                    className="h-8 min-w-40 flex-1 rounded-full border border-hairline bg-muted px-3 font-mono text-[13px] text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                )}
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label="Remove filter"
                  onClick={() => setDraft((d) => d.filter((_, n) => n !== i))}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Results */}
      {page.error ? (
        <div className="px-4 py-4">
          <ErrorPanel
            error={page.error}
            fallback="Couldn't read these rows"
            onRetry={() => void page.refetch()}
          />
        </div>
      ) : page.isLoading ? (
        <div aria-hidden className="space-y-2 px-4 py-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">
          {query.filters.length || query.search
            ? 'Nothing matches. Loosen a filter or Reset.'
            : 'This table is empty.'}
        </p>
      ) : mode === 'documents' ? (
        <div
          className={cn(
            'min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3',
            page.isPlaceholderData && 'opacity-60',
          )}
        >
          {rows.map((r, i) => (
            <div key={from + i}>{card(r)}</div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div
            className={cn('min-w-0 flex-1 overflow-auto', page.isPlaceholderData && 'opacity-60')}
          >
            <table className="min-w-full border-separate border-spacing-0 font-mono text-xs">
              <thead className="sticky top-0 z-[1] bg-canvas">
                <tr>
                  <th className="w-10 border-b border-hairline px-2 py-2 text-right font-normal text-muted-foreground">
                    #
                  </th>
                  {gridCols.map((c) => {
                    const col = table.columns.find((x) => x.name === c);
                    const key = col?.isPrimary ? 'PK' : outgoing.has(c) ? 'FK' : null;
                    return (
                      <th
                        key={c}
                        className="border-b border-hairline px-3 py-2 text-left font-medium whitespace-nowrap text-fg"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            !isRedis &&
                            apply({
                              sort: {
                                column: c,
                                desc: query.sort?.column === c ? !query.sort.desc : false,
                              },
                            })
                          }
                          className="flex cursor-pointer items-center gap-1.5"
                          title={
                            col ? `${col.dataType}${col.nullable ? ', optional' : ''}` : undefined
                          }
                        >
                          {key && (
                            <span
                              className={cn(
                                'text-[9px] font-bold',
                                key === 'PK' ? 'text-warning' : 'text-info',
                              )}
                            >
                              {key}
                            </span>
                          )}
                          {c}
                          {query.sort?.column === c && (
                            <span className="text-muted-foreground">
                              {query.sort.desc ? '↓' : '↑'}
                            </span>
                          )}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={from + i}
                    onClick={() => setSelected(selected === i ? null : i)}
                    aria-selected={selected === i}
                    className={cn(
                      'cursor-pointer',
                      selected === i ? 'bg-accent' : 'hover:bg-accent',
                    )}
                  >
                    <td className="border-b border-hairline px-2 py-1.5 text-right text-muted-foreground tabular-nums">
                      {from + i + 1}
                    </td>
                    {gridCols.map((c) => (
                      <td
                        key={c}
                        className={cn(
                          'max-w-72 truncate border-b border-hairline px-3 py-1.5',
                          KIND_CLS[kindOf(r[c])],
                        )}
                        title={preview(r[c], 500)}
                      >
                        {preview(r[c], 120)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected != null && rows[selected] && (
            <aside className="w-[26rem] shrink-0 overflow-y-auto border-l border-hairline p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>Row {from + selected + 1}</span>
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label="Close"
                  onClick={() => setSelected(null)}
                >
                  <X />
                </Button>
              </div>
              {card(rows[selected])}
            </aside>
          )}
        </div>
      )}

      {/* Pager */}
      <div className="flex shrink-0 items-center gap-3 border-t border-hairline px-4 py-2 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {rows.length === 0
            ? '0 rows'
            : `${(from + 1).toLocaleString()}–${(from + rows.length).toLocaleString()} of ${
                total == null
                  ? 'many'
                  : `${total.toLocaleString()}${page.data?.totalCapped ? '+' : ''}`
              }`}
          {page.data && <> · {page.data.durationMs} ms</>}
        </span>
        <label className="ml-auto flex items-center gap-1.5">
          Rows per page
          <select
            value={query.limit}
            onChange={(e) => setQuery((q) => ({ ...q, limit: Number(e.target.value), page: 0 }))}
            className="cursor-pointer rounded border border-hairline bg-muted px-1 py-0.5 text-xs text-fg"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="ghost"
          size="iconSm"
          aria-label="Previous page"
          disabled={query.page === 0 || page.isFetching}
          onClick={() => {
            setSelected(null);
            setQuery((q) => ({ ...q, page: q.page - 1 }));
          }}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          aria-label="Next page"
          disabled={
            rows.length < query.limit ||
            (total != null && !page.data?.totalCapped && from + rows.length >= total) ||
            page.isFetching
          }
          onClick={() => {
            setSelected(null);
            setQuery((q) => ({ ...q, page: q.page + 1 }));
          }}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
};
