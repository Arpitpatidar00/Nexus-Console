import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Switch } from '@/shared/ui/Switch';
import type { DbConnection } from '@/features/databases/api/databases.schema';
import type { DbSchema } from '@/features/databases/api/explorer.schema';
import { useDbSchemas } from '@/features/databases/api/useExplorer';
import { buildMap, type Detail } from '@/features/databases/utils/diagram';
import { toMermaid } from '@/features/databases/utils/mermaid';
import { crossDbLinks, linksOf } from '@/features/databases/utils/relations';
import { DiagramCanvas } from '@/features/databases/components/DiagramCanvas';

interface Props {
  connections: DbConnection[];
  onOpenTable: (connectionId: string, key: string) => void;
}

/** Every connected database on one canvas, for a system split into services:
 * each database boxed with its own tables, and the references between them
 * (always guesses — no database can declare a key into another). */
export const MapView = ({ connections, onOpenTable }: Props) => {
  const [detail, setDetail] = useState<Detail>('names');
  const [cross, setCross] = useState(true);
  const results = useDbSchemas(connections.map((c) => c.id));
  const ready = connections
    .map((c, i) => ({ c, s: results[i]?.data as DbSchema | undefined }))
    .filter((x): x is { c: DbConnection; s: DbSchema } => x.s != null);
  const failed = connections.filter((_, i) => results[i]?.error);
  const loading = results.filter((r) => r.isLoading).length;

  const dbs = ready.map(({ c, s }) => ({
    id: c.id,
    label: c.name,
    sublabel: `${s.database} · ${s.tables.length} tables`,
    tables: s.tables,
    links: linksOf(s),
  }));
  const between = cross
    ? crossDbLinks(ready.map(({ c, s }) => ({ id: c.id, label: c.name, schema: s })))
    : [];

  if (ready.length === 0) {
    return (
      <p className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
        {loading > 0
          ? `Reading ${loading} database${loading === 1 ? '' : 's'}…`
          : 'None of your databases could be read.'}
      </p>
    );
  }

  return (
    <DiagramCanvas
      diagram={buildMap(dbs, between, detail)}
      detail={detail}
      onDetail={setDetail}
      onOpenTable={(id) => {
        const slash = id.indexOf('/');
        onOpenTable(id.slice(0, slash), id.slice(slash + 1));
      }}
      exportName="all-databases-map"
      exportTitle={`All databases · ${ready.length} connected`}
      mermaid={() =>
        ready.map(({ c, s }) => `%% ${c.name}\n${toMermaid(s.tables, linksOf(s))}`).join('\n')
      }
      aside={
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            id="map-cross"
            checked={cross}
            onChange={setCross}
            ariaLabel="Show guessed links between databases"
          />
          <label htmlFor="map-cross" className="cursor-pointer">
            Links between databases
          </label>
        </span>
      }
      footnote={
        <span className="flex flex-wrap items-center gap-x-3">
          <span>
            {ready.length} database{ready.length === 1 ? '' : 's'} · {between.length} guessed link
            {between.length === 1 ? '' : 's'} between them (dashed, from column names like user_id)
          </span>
          {loading > 0 && <span>Reading {loading} more…</span>}
          {failed.length > 0 && (
            <span className="flex items-center gap-1 text-warning">
              <AlertTriangle className="size-3.5" aria-hidden />
              Couldn't read {failed.map((c) => c.name).join(', ')}
            </span>
          )}
        </span>
      }
    />
  );
};
