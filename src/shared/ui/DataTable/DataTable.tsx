import { useRef, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { DataTableProps } from './DataTable.types';

/** Generic virtualized table: react-table (sort) + react-virtual (rows).
 * Smoked Glass styled with hairline dividers and frosted header. */
export function DataTable<T>({
  data,
  columns,
  getRowId,
  estimateRowHeight = 48,
  emptyMessage = 'Nothing to show.',
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  // TanStack Table's API can't be memoized; React Compiler skips this component
  // by design. Nothing memoized receives `table`, so the warning is expected.
  // oxlint-disable-next-line react/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: 12,
  });

  return (
    <div ref={parentRef} className="h-full min-h-0 flex-1 overflow-auto">
      <div className="sticky top-0 z-[1] flex border-b border-hairline bg-popover/80 backdrop-blur-md">
        {table.getFlatHeaders().map((h) => {
          const sorted = h.column.getIsSorted();
          const alignRight = h.column.columnDef.meta?.align === 'right';
          return (
            <button
              key={h.id}
              type="button"
              onClick={h.column.getToggleSortingHandler()}
              disabled={!h.column.getCanSort()}
              style={{ width: h.getSize(), flexGrow: h.column.columnDef.meta?.grow ? 1 : 0 }}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors select-none',
                'enabled:hover:text-fg disabled:cursor-default',
                alignRight ? 'justify-end text-right' : 'text-left',
              )}
            >
              {flexRender(h.column.columnDef.header, h.getContext())}
              {sorted === 'asc' && <ChevronUp className="size-3.5 text-ember" />}
              {sorted === 'desc' && <ChevronDown className="size-3.5 text-ember" />}
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const row = rows[vi.index];
            return (
              <div
                key={row.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: vi.size,
                  transform: `translateY(${vi.start}px)`,
                }}
                className="flex items-center border-b border-hairline transition-colors hover:bg-glass-strong"
              >
                {row.getVisibleCells().map((cell) => (
                  <div
                    key={cell.id}
                    style={{
                      width: cell.column.getSize(),
                      flexGrow: cell.column.columnDef.meta?.grow ? 1 : 0,
                    }}
                    className={cn(
                      'min-w-0 px-4 py-2 font-mono text-xs',
                      cell.column.columnDef.meta?.align === 'right' && 'text-right',
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
