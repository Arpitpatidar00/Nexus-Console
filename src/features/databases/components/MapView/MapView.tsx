import { useState } from 'react';
import { AlertCircle, AlertTriangle, SlidersHorizontal } from 'lucide-react';
import { Switch } from '@/shared/ui/Switch';
import { Button } from '@/shared/ui/Button';
import type { DbConnection } from '@/features/databases/api/databases.schema';
import type { DbSchema } from '@/features/databases/api/explorer.schema';
import { useDbSchemas } from '@/features/databases/api/useExplorer';
import {
  useDbCustomMappings,
  useDbRejectedCandidates,
} from '@/features/databases/api/useDatabases';
import { buildMap, type Detail } from '@/features/databases/utils/diagram';
import { toMermaid } from '@/features/databases/utils/mermaid';
import { crossDbLinks, linksOf } from '@/features/databases/utils/relations';
import { DiagramCanvas } from '@/features/databases/components/DiagramCanvas';
import { AmbiguousRelationsDialog } from '@/features/databases/components/AmbiguousRelationsDialog';
import { CustomMappingsDialog } from '@/features/databases/components/CustomMappingsDialog';

interface Props {
  connections: DbConnection[];
  groupId?: string | null;
  onOpenTable: (connectionId: string, key: string) => void;
}

/** Every connected database on one canvas, for a system split into services:
 * each database boxed with its own tables, and the references between them
 * (distinguishing declared, configured, and inferred candidates). */
export const MapView = ({ connections, groupId, onOpenTable }: Props) => {
  const [detail, setDetail] = useState<Detail>('names');
  const [cross, setCross] = useState(true);
  const [ambiguousOpen, setAmbiguousOpen] = useState(false);
  const [mappingsOpen, setMappingsOpen] = useState(false);

  const { data: customMappings = [] } = useDbCustomMappings(groupId);
  const { data: rejectedCandidates = [] } = useDbRejectedCandidates(groupId);

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
    ? crossDbLinks(
        ready.map(({ c, s }) => ({ id: c.id, label: c.name, schema: s })),
        { customMappings, rejectedCandidates },
      )
    : [];

  const ambiguousLinks = between.filter((l) => l.status === 'ambiguous');
  const configuredCount = between.filter((l) => l.provenance === 'configured').length;
  const inferredCount = between.filter(
    (l) => l.provenance === 'inferred' && l.status === 'active',
  ).length;

  const connectionNames = Object.fromEntries(connections.map((c) => [c.id, c.name]));

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
    <>
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
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                id="map-cross"
                checked={cross}
                onChange={setCross}
                ariaLabel="Show links between databases"
              />
              <label htmlFor="map-cross" className="cursor-pointer">
                Links between databases
              </label>
            </span>

            {ambiguousLinks.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-warning/40 text-xs text-warning hover:bg-warning-soft"
                onClick={() => setAmbiguousOpen(true)}
              >
                <AlertCircle className="mr-1 size-3.5 text-warning" />
                {ambiguousLinks.length} Ambiguous
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setMappingsOpen(true)}
            >
              <SlidersHorizontal className="mr-1 size-3.5 text-muted-foreground" />
              Mappings ({customMappings.length})
            </Button>
          </div>
        }
        footnote={
          <span className="flex flex-wrap items-center gap-x-3">
            <span>
              {ready.length} database{ready.length === 1 ? '' : 's'} · {between.length}{' '}
              cross-database link{between.length === 1 ? '' : 's'} (
              {configuredCount > 0 && `${configuredCount} configured, `}
              {inferredCount} inferred
              {ambiguousLinks.length > 0 && `, ${ambiguousLinks.length} ambiguous`})
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

      <AmbiguousRelationsDialog
        open={ambiguousOpen}
        onOpenChange={setAmbiguousOpen}
        groupId={groupId ?? null}
        ambiguousLinks={ambiguousLinks}
        connectionNames={connectionNames}
      />

      <CustomMappingsDialog
        open={mappingsOpen}
        onOpenChange={setMappingsOpen}
        groupId={groupId ?? null}
        connections={connections}
      />
    </>
  );
};
