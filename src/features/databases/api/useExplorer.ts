import { keepPreviousData, useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, CMD } from '@/shared/tauri';
import { dbKeys } from './keys';
import {
  browsePageSchema,
  dbSchemaSchema,
  type BrowseRequest,
  type DbSchema,
} from './explorer.schema';

/** A database's tables, columns, keys, indexes and foreign keys. Schemas
 * change rarely: refetch on demand (the refresh button), not on focus. */
export function useDbSchema(id: string | null) {
  return useQuery<DbSchema>({
    queryKey: dbKeys.schema(id ?? ''),
    queryFn: () => ipc(CMD.DB_SCHEMA, { id }, dbSchemaSchema),
    enabled: id != null,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
    meta: { silent: true },
  });
}

/** Every connection's schema at once, for the all-databases map. */
export function useDbSchemas(ids: string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: dbKeys.schema(id),
      queryFn: () => ipc(CMD.DB_SCHEMA, { id }, dbSchemaSchema),
      staleTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: false,
      meta: { silent: true },
    })),
  });
}

/** One page of rows. The previous page stays on screen while the next loads. */
export function useBrowse(id: string, request: BrowseRequest | null) {
  return useQuery({
    queryKey: dbKeys.browse(id, request),
    queryFn: () => ipc(CMD.DB_BROWSE, { id, request }, browsePageSchema),
    enabled: request != null,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    retry: false,
    meta: { silent: true },
  });
}

/** Save a diagram or export to ~/Downloads; resolves to the saved path. */
export function useSaveExport() {
  return useMutation({
    mutationFn: (file: { fileName: string; data: string; base64: boolean }) =>
      ipc(CMD.DB_SAVE_EXPORT, file, z.string()),
    meta: { label: 'Saving export', quiet: true },
  });
}
