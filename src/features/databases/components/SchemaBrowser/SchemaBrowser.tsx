import { useState } from 'react';
import { Table, Search, RefreshCw } from 'lucide-react';
import { useDbSchema } from '../../api/useDatabases';

interface SchemaBrowserProps {
  connectionId: string;
  onSelectTable: (tableName: string) => void;
}

export function SchemaBrowser({ connectionId, onSelectTable }: SchemaBrowserProps) {
  const { data: tables = [], isLoading, refetch } = useDbSchema(connectionId);
  const [filter, setFilter] = useState('');

  const filtered = tables.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="flex h-full w-64 flex-col border-r border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Table className="h-3.5 w-3.5 text-info" />
          <span>Tables & Views</span>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          title="Refresh schema"
          className="rounded p-1 text-fg-muted transition-colors hover:bg-muted hover:text-fg"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="border-b border-border p-2">
        <div className="relative">
          <Search className="absolute top-2 left-2.5 h-3 w-3 text-fg-muted" />
          <input
            type="text"
            placeholder="Filter tables..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded border border-border bg-muted py-1 pr-2 pl-7 text-xs text-fg focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 divide-y divide-border/50 overflow-y-auto p-1">
        {isLoading ? (
          <div className="p-4 text-center text-xs text-fg-muted">Loading schema...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-fg-muted">No tables found.</div>
        ) : (
          filtered.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => onSelectTable(t.name)}
              className="group flex w-full items-center justify-between rounded p-2 text-left transition-colors hover:bg-muted"
            >
              <span className="truncate font-mono text-xs text-fg group-hover:text-info">
                {t.name}
              </span>
              <span className="text-[10px] text-fg-muted">{t.sizePretty}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
