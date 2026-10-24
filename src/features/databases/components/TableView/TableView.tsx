import { useState } from 'react';
import { formatBytes } from '@/shared/lib/format';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import type { DbSchema, Filter, TableInfo } from '@/features/databases/api/explorer.schema';
import { buildDiagram, type Detail } from '@/features/databases/utils/diagram';
import { toMermaid, fileStem } from '@/features/databases/utils/mermaid';
import { keyOf, neighborhood, type Link } from '@/features/databases/utils/relations';
import { DiagramCanvas } from '@/features/databases/components/DiagramCanvas';
import { DocumentsView } from '@/features/databases/components/DocumentsView';
import { IndexesView } from '@/features/databases/components/IndexesView';
import { SchemaView } from '@/features/databases/components/SchemaView';
import type { OpenTable } from '@/features/databases/components/DocumentCard';

type Tab = 'documents' | 'schema' | 'indexes' | 'relations';

interface Props {
  connectionId: string;
  connectionName: string;
  schema: DbSchema;
  table: TableInfo;
  links: Link[];
  nameOf: (key: string) => string;
  onOpenTable: OpenTable;
  initialFilter?: Filter;
}

const KIND_LABEL: Record<string, string> = {
  table: 'table',
  view: 'view',
  materializedView: 'materialized view',
  foreignTable: 'foreign table',
  collection: 'collection',
  keyspace: 'key prefix',
};

/** One table, Compass-style: its rows, its shape, its indexes and its place
 * among the tables it's linked to. */
export const TableView = ({
  connectionId,
  connectionName,
  schema,
  table,
  links,
  nameOf,
  onOpenTable,
  initialFilter,
}: Props) => {
  const [tab, setTab] = useState<Tab>('documents');
  const [detail, setDetail] = useState<Detail>('all');
  const key = keyOf(table);
  const near = neighborhood(key, links);
  const nearTables = schema.tables.filter((t) => near.has(keyOf(t)));
  const nearLinks = links.filter((l) => near.has(l.from) && near.has(l.to));
  const counts = {
    in: links.filter((l) => l.to === key).length,
    out: links.filter((l) => l.from === key).length,
  };
  const isRedis = schema.engine === 'redis';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-b border-hairline px-4 pt-3 pb-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-fg">
            {schema.schemas.length > 1 && (
              <span className="text-muted-foreground">{table.schema}.</span>
            )}
            {table.name}
          </h2>
          <p className="text-xs text-muted-foreground tabular-nums">
            {KIND_LABEL[table.kind] ?? table.kind}
            {table.rowEstimate != null &&
              ` · ≈ ${table.rowEstimate.toLocaleString()} ${isRedis ? 'keys' : 'rows'}`}
            {table.sizeBytes != null && ` · ${formatBytes(table.sizeBytes)}`}
            {` · ${table.columns.length} ${schema.engine.startsWith('mongo') ? 'fields' : 'columns'}`}
            {!isRedis && ` · links ${counts.out} out, ${counts.in} in`}
            {table.comment && ` · ${table.comment}`}
          </p>
        </div>
        <SegmentedControl<Tab>
          ariaLabel="Table view"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'documents', label: isRedis ? 'Keys' : 'Documents' },
            { value: 'schema', label: 'Schema' },
            ...(isRedis
              ? []
              : [{ value: 'indexes' as const, label: `Indexes · ${table.indexes.length}` }]),
            ...(isRedis ? [] : [{ value: 'relations' as const, label: 'Relations' }]),
          ]}
        />
      </div>
      {tab === 'documents' ? (
        <DocumentsView
          key={`${connectionId}:${key}:${JSON.stringify(initialFilter ?? null)}`}
          connectionId={connectionId}
          engine={schema.engine}
          table={table}
          links={links}
          nameOf={nameOf}
          onOpenTable={onOpenTable}
          initialFilter={initialFilter}
        />
      ) : tab === 'schema' ? (
        <SchemaView table={table} links={links} nameOf={nameOf} onOpenTable={onOpenTable} />
      ) : tab === 'indexes' ? (
        <IndexesView table={table} links={links} nameOf={nameOf} />
      ) : nearLinks.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">
          {table.name} isn't linked to any other table by a foreign key or a recognisable column
          name.
        </p>
      ) : (
        <DiagramCanvas
          diagram={buildDiagram(nearTables, nearLinks, detail)}
          detail={detail}
          onDetail={setDetail}
          highlight={new Set([key])}
          onOpenTable={(id) => id !== key && onOpenTable(id)}
          exportName={fileStem(connectionName, table.name, 'relations')}
          exportTitle={`${connectionName} · ${table.name} and the tables it links to`}
          mermaid={() => toMermaid(nearTables, nearLinks)}
          footnote={`${nearTables.length - 1} linked table${nearTables.length === 2 ? '' : 's'} · solid lines are foreign keys, dashed ones are guessed from column names · click a table to open it`}
        />
      )}
    </div>
  );
};
