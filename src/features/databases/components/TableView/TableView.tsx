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
import { getEngineCapabilities } from '@/features/databases/utils/capabilities';
import type { OpenTable } from '@/features/databases/components/DocumentCard';

type Tab = 'documents' | 'schema' | 'indexes' | 'relations';

import type { DbConnection } from '@/features/databases/api/databases.schema';
import { ArrowRight, CornerDownRight, ExternalLink } from 'lucide-react';
import { Button } from '@/shared/ui/Button';

interface Props {
  connectionId: string;
  connectionName: string;
  schema: DbSchema;
  table: TableInfo;
  links: Link[];
  nameOf: (key: string) => string;
  onOpenTable: OpenTable;
  initialFilter?: Filter;
  connections?: DbConnection[];
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
  connections,
}: Props) => {
  const [tab, setTab] = useState<Tab>('documents');
  const [detail, setDetail] = useState<Detail>('all');
  const key = keyOf(table);
  const near = neighborhood(key, links);
  const nearTables = schema.tables.filter((t) => near.has(keyOf(t)));
  const nearLinks = links.filter(
    (l) =>
      near.has(l.from) &&
      near.has(l.to) &&
      (!l.fromDb || l.fromDb === connectionId) &&
      (!l.toDb || l.toDb === connectionId),
  );

  const externalLinks = links.filter(
    (l) =>
      (l.from === key && l.toDb && l.toDb !== connectionId) ||
      (l.to === key && l.fromDb && l.fromDb !== connectionId),
  );

  const counts = {
    in: links.filter((l) => l.to === key).length,
    out: links.filter((l) => l.from === key).length,
  };
  const caps = getEngineCapabilities(schema.engine);

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
              ` · ≈ ${table.rowEstimate.toLocaleString()} ${caps.family === 'redis' ? 'keys' : 'rows'}`}
            {table.sizeBytes != null && ` · ${formatBytes(table.sizeBytes)}`}
            {` · ${table.columns.length} ${caps.family === 'mongodb' ? 'fields' : 'columns'}`}
            {caps.supportsDiagram && ` · links ${counts.out} out, ${counts.in} in`}
            {externalLinks.length > 0 && ` · ${externalLinks.length} cross-database`}
            {table.comment && ` · ${table.comment}`}
          </p>
        </div>
        <SegmentedControl<Tab>
          ariaLabel="Table view"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'documents', label: caps.family === 'redis' ? 'Keys' : 'Documents' },
            { value: 'schema', label: 'Schema' },
            ...(caps.supportsIndexes
              ? [{ value: 'indexes' as const, label: `Indexes · ${table.indexes.length}` }]
              : []),
            ...(caps.supportsDiagram ? [{ value: 'relations' as const, label: 'Relations' }] : []),
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
          connections={connections}
        />
      ) : tab === 'schema' ? (
        <SchemaView
          table={table}
          links={links}
          nameOf={nameOf}
          onOpenTable={onOpenTable}
          connectionId={connectionId}
          connections={connections}
        />
      ) : tab === 'indexes' ? (
        <IndexesView table={table} links={links} nameOf={nameOf} />
      ) : nearLinks.length === 0 && externalLinks.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">
          {table.name} isn't linked to any other table by a foreign key, cross-database mapping, or
          recognisable column name.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {nearLinks.length > 0 && (
            <div className="min-h-[340px] flex-1">
              <DiagramCanvas
                diagram={buildDiagram(nearTables, nearLinks, detail)}
                detail={detail}
                onDetail={setDetail}
                highlight={new Set([key])}
                onOpenTable={(id) => id !== key && onOpenTable(id)}
                exportName={fileStem(connectionName, table.name, 'relations')}
                exportTitle={`${connectionName} · ${table.name} and the tables it links to`}
                mermaid={() => toMermaid(nearTables, nearLinks)}
                footnote={`${nearTables.length - 1} local linked table${nearTables.length === 2 ? '' : 's'} · solid lines are foreign keys, dashed ones are guessed · click a table to open it`}
              />
            </div>
          )}

          {externalLinks.length > 0 && (
            <section className="shrink-0 border-t border-hairline bg-muted/20 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                <ExternalLink className="size-3.5" aria-hidden />
                Cross-Database Microservice Relationships ({externalLinks.length})
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {externalLinks.map((l) => {
                  const isOutgoing = l.from === key && l.toDb && l.toDb !== connectionId;
                  const targetConn = isOutgoing
                    ? connections?.find((c) => c.id === l.toDb)
                    : connections?.find((c) => c.id === l.fromDb);

                  return (
                    <div
                      key={l.id}
                      className="space-y-2 rounded-lg border border-hairline bg-canvas p-3 text-xs shadow-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-fg">
                          {isOutgoing ? 'Points to' : 'Referenced by'}{' '}
                          <span className="text-info">
                            {targetConn?.name ?? 'External Service'}
                          </span>
                        </span>
                        {l.provenance === 'configured' ? (
                          <span className="bg-teal-soft text-teal rounded px-1.5 py-0.5 text-[10px] font-medium">
                            application
                          </span>
                        ) : (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            inferred
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 font-mono text-muted-foreground">
                        {isOutgoing ? (
                          <>
                            <span className="text-fg">{l.fromColumns.join(', ')}</span>
                            <ArrowRight className="size-3 shrink-0" aria-hidden />
                            <span className="text-fg">
                              {nameOf(l.to)}.{l.toColumns.join(', ')}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-fg">
                              {nameOf(l.from)}.{l.fromColumns.join(', ')}
                            </span>
                            <CornerDownRight className="size-3 shrink-0" aria-hidden />
                            <span className="text-fg">{l.toColumns.join(', ')}</span>
                          </>
                        )}
                      </div>

                      {l.compatibility === 'incompatible' && (
                        <div className="bg-destructive-soft rounded p-1.5 text-[11px] text-destructive">
                          Warning: {l.compatibilityReason ?? 'Type mismatch'}
                        </div>
                      )}

                      <div className="pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => {
                            if (isOutgoing) {
                              onOpenTable(l.toDb!, l.to);
                            } else {
                              onOpenTable(l.fromDb!, l.from);
                            }
                          }}
                        >
                          Open {nameOf(isOutgoing ? l.to : l.from)} in{' '}
                          {targetConn?.name ?? 'Database'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
