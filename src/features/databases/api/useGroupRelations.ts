import { useMemo } from 'react';
import type { DbConnection } from './databases.schema';
import type { DbSchema } from './explorer.schema';
import { useDbSchemas } from './useExplorer';
import { useDbCustomMappings, useDbRejectedCandidates } from './useDatabases';
import { crossDbLinks, type Link, type NamedSchema } from '../utils/relations';

export interface GroupRelationsResult {
  links: Link[];
  readySchemas: NamedSchema[];
  schemasById: Record<string, DbSchema>;
  connectionsById: Record<string, DbConnection>;
  isLoading: boolean;
  linksForTable: (connectionId: string, tableKey: string) => Link[];
}

/**
 * Loads group-scoped schemas, custom mappings, and candidate rejections,
 * returning the unified cross-database relationship model for the group.
 */
export function useGroupRelations(
  groupId: string | null | undefined,
  connections: DbConnection[],
): GroupRelationsResult {
  const groupConns = useMemo(() => {
    if (groupId) {
      return connections.filter((c) => c.groupId === groupId);
    }
    // If no group is selected, consider connections without a group or all connections
    const ungrouped = connections.filter((c) => !c.groupId);
    return ungrouped.length > 0 ? ungrouped : connections;
  }, [connections, groupId]);

  const connIds = useMemo(() => groupConns.map((c) => c.id), [groupConns]);
  const schemaResults = useDbSchemas(connIds);

  const { data: customMappings = [] } = useDbCustomMappings(groupId);
  const { data: rejectedCandidates = [] } = useDbRejectedCandidates(groupId);

  const isLoading = schemaResults.some((r) => r.isLoading);

  const connectionsById = useMemo(() => {
    const map: Record<string, DbConnection> = {};
    for (const c of connections) {
      map[c.id] = c;
    }
    return map;
  }, [connections]);

  const { readySchemas, schemasById } = useMemo(() => {
    const ready: NamedSchema[] = [];
    const byId: Record<string, DbSchema> = {};

    groupConns.forEach((c, i) => {
      const s = schemaResults[i]?.data;
      if (s) {
        ready.push({ id: c.id, label: c.name, schema: s });
        byId[c.id] = s;
      }
    });

    return { readySchemas: ready, schemasById: byId };
  }, [groupConns, schemaResults]);

  const links = useMemo(() => {
    if (readySchemas.length === 0) return [];
    return crossDbLinks(readySchemas, {
      customMappings,
      rejectedCandidates,
    });
  }, [readySchemas, customMappings, rejectedCandidates]);

  const linksForTable = (connectionId: string, tableKey: string): Link[] => {
    return links.filter(
      (l) =>
        (l.fromDb === connectionId && l.from === tableKey) ||
        (l.toDb === connectionId && l.to === tableKey),
    );
  };

  return {
    links,
    readySchemas,
    schemasById,
    connectionsById,
    isLoading,
    linksForTable,
  };
}
